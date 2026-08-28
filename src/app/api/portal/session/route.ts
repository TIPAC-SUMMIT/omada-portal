/**
 * Portal Session API
 * POST /api/portal/session
 * 
 * Creates secure portal session from Omada captive portal redirect
 */

import { NextRequest } from 'next/server'
import { createPortalSessionSchema } from '@/lib/validation'
import { supabaseAdmin } from '@/lib/supabase'
import { 
  generateSecureToken, 
  hashSessionToken, 
  addMinutes, 
  apiSuccess, 
  apiError, 
  validateRequestBody,
  logError
} from '@/lib/utils'
import { PORTAL_SESSION_EXPIRY_MINUTES, HTTP_STATUS } from '@/lib/constants'
import type { Site, Package } from '@/lib/types'

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

    // Match the captive-portal session to the configured Northbound site.
    let site: Site | null = null
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('omada_site_id', process.env.OMADA_SITE_ID || '')
      .eq('status', 'ACTIVE')
      .single()
    
    if (sites) {
      site = sites
    }

    // Get available packages for this site (or all if no site match)
    let packagesQuery = supabaseAdmin
      .from('packages')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('sort_order')

    if (site) {
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

    // Create portal session record
    const { error: sessionError } = await supabaseAdmin
      .from('portal_sessions')
      .insert({
        session_token_hash: sessionTokenHash,
        site_id: site?.id || null,
        client_mac: params.clientMac,
        ap_mac: params.apMac,
        ssid_name: params.ssidName,
        site_name: params.site || null,
        portal_timestamp: params.t || null,
        gateway_mac: params.gatewayMac || null,
        radio_id: params.radioId || null,
        vid: params.vid || null,
        redirect_url: params.redirectUrl || null,
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