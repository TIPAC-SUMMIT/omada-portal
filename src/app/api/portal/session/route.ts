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

    // Generate secure session token
    const sessionToken = generateSecureToken(32)
    const sessionTokenHash = hashSessionToken(sessionToken)
    const expiresAt = addMinutes(PORTAL_SESSION_EXPIRY_MINUTES)

    // Find site by SSID name (basic matching for MVP)
    // In production, you'd match by AP MAC or more sophisticated rules
    let site: Site | null = null
    const { data: sites } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('status', 'ACTIVE')
      .limit(1)
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

    return Response.json(apiError('Failed to create portal session'), { 
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR 
    })
  }
}