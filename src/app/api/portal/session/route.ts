/**
 * Portal Session API
 * POST /api/portal/session
 * 
 * Creates secure portal session from Omada captive portal redirect
 */

import { NextRequest } from 'next/server'
import { createPortalSessionSchema } from '@/lib/validation'
import { supabaseAdmin } from '@/lib/supabase'
import { resolveSessionController } from '@/lib/services/controller-routing'
import { 
  generateSecureToken, 
  hashSessionToken, 
  addMinutes, 
  apiSuccess, 
  apiError, 
  validateRequestBody,
  logError
} from '@/lib/utils'
import { ENV, PORTAL_SESSION_EXPIRY_MINUTES, HTTP_STATUS } from '@/lib/constants'
import type { Site, Package } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return Response.json(apiError('Session token is required', 'INVALID_SESSION'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const { data: session, error } = await supabaseAdmin
      .from('portal_sessions')
      .select('client_mac, ap_mac, ssid_name, site_name, portal_timestamp, gateway_mac, radio_id, vid, redirect_url, portal_auth_url')
      .eq('session_token_hash', hashSessionToken(token))
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (error || !session) {
      return Response.json(apiError('Invalid or expired session', 'INVALID_SESSION'), {
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    return Response.json(apiSuccess({
      clientMac: session.client_mac,
      apMac: session.ap_mac,
      ssidName: session.ssid_name,
      site: session.site_name,
      t: session.portal_timestamp,
      gatewayMac: session.gateway_mac,
      radioId: session.radio_id,
      vid: session.vid,
      redirectUrl: session.redirect_url,
      tp: session.portal_auth_url,
    }))
  } catch (error) {
    logError(error, 'Portal session lookup')
    return Response.json(apiError('Unable to recover portal session'), {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json()
    const data = validateRequestBody(createPortalSessionSchema)(body)
    
    const { params } = data
    const clientIp = request.headers.get('x-forwarded-for') || request.ip || null
    const userAgent = request.headers.get('user-agent') || null

    const { count: recentSessions } = await supabaseAdmin
      .from('portal_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('client_mac', params.clientMac)
      .gt('created_at', new Date(Date.now() - 15 * 60_000).toISOString())

    if ((recentSessions ?? 0) >= 5) {
      return Response.json(apiError('Too many portal sessions for this device', 'SESSION_RATE_LIMITED'), {
        status: HTTP_STATUS.TOO_MANY_REQUESTS
      })
    }

    // Generate secure session token
    const sessionToken = generateSecureToken(32)
    const sessionTokenHash = hashSessionToken(sessionToken)
    const expiresAt = addMinutes(PORTAL_SESSION_EXPIRY_MINUTES)

    // Resolve controller and access point using smart routing
    const resolution = await resolveSessionController({
      apMac: params.apMac,
      siteIdentifier: params.site,
      clientMac: params.clientMac
    })

    if (resolution.ambiguous) {
      logError(new Error(resolution.error || 'Ambiguous resolution'), 'Portal session resolution')
      return Response.json(apiError(resolution.error || 'Portal access point is ambiguous', 'AMBIGUOUS_AP'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    let site = resolution.site
    let controller = resolution.controller?.id ? resolution.controller : null
    const ap = resolution.ap

    // Preserve the existing single-controller deployment until a controller
    // record is configured for the site. A mapped controller is always preferred.
    if (!controller?.id) {
      const legacyQuery = supabaseAdmin
        .from('sites')
        .select('*')
        .eq('status', 'ACTIVE')
      const { data: byName } = params.site
        ? await legacyQuery.eq('name', params.site).maybeSingle()
        : { data: null }
      const { data: byId } = !byName
        ? await supabaseAdmin
          .from('sites')
          .select('*')
          .eq('status', 'ACTIVE')
          .eq('omada_site_id', params.site || ENV.OMADA_SITE_ID)
          .maybeSingle()
        : { data: null }
      const legacySite = byName || byId
      if (legacySite) site = legacySite
      if (!site?.id && !ENV.OMADA_SITE_ID) {
        return Response.json(apiError('This Omada site is not configured in the portal', 'SITE_NOT_CONFIGURED'), {
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
    }

    // Get available packages for this site
    let packagesQuery = supabaseAdmin
      .from('packages')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('sort_order')

    if (site?.id) {
      // Get packages assigned to this site
      const { data: sitePackages } = await supabaseAdmin
        .from('site_packages')
        .select('package_id')
        .eq('site_id', site.id)
        .eq('is_active', true)
      
      if (sitePackages && sitePackages.length > 0) {
        const packageIds = sitePackages.map(sp => sp.package_id)
        packagesQuery = packagesQuery.in('id', packageIds)
      }
    }

    const { data: packages, error: packagesError } = await packagesQuery

    if (packagesError) {
      throw new Error(`Failed to load packages: ${packagesError.message}`)
    }

    // Create portal session record with controller and AP tracking
    const { error: sessionError } = await supabaseAdmin
      .from('portal_sessions')
      .insert({
        session_token_hash: sessionTokenHash,
        site_id: site?.id || null,
        controller_id: controller?.id || null,
        access_point_id: ap?.id || null,
        client_mac: params.clientMac,
        ap_mac: params.apMac,
        ssid_name: params.ssidName,
        site_name: site?.name || params.site || null,
        portal_timestamp: params.t || null,
        gateway_mac: params.gatewayMac || null,
        radio_id: params.radioId || null,
        vid: params.vid || null,
        redirect_url: params.originUrl || params.redirectUrl || null,
        portal_auth_url: params.portalAuthUrl || null,
        user_agent: userAgent,
        expires_at: expiresAt
      })

    if (sessionError) {
      throw new Error(`Failed to create session: ${sessionError.message}`)
    }

    return Response.json(apiSuccess({
      sessionToken,
      site,
      packages: packages || [],
      expiresAt
    }), { status: HTTP_STATUS.CREATED })

  } catch (error) {
    logError(error, 'Portal session creation')
    
    if (error instanceof Error && error.message.includes('Validation failed')) {
      return Response.json(apiError(error.message, 'VALIDATION_ERROR'), { 
        status: HTTP_STATUS.BAD_REQUEST 
      })
    }

    return Response.json(apiError('Imeshindikana kuanzisha ukurasa wa Wi-Fi.'), {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR 
    })
  }
}
