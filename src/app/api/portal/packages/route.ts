/**
 * Portal Packages API
 * GET /api/portal/packages
 * 
 * Returns available packages for authenticated portal session
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { hashSessionToken, apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

async function getPortalSession(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7)
  const tokenHash = hashSessionToken(token)

  const { data: session, error } = await supabaseAdmin
    .from('portal_sessions')
    .select('*')
    .eq('session_token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !session) {
    return null
  }

  return session
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const session = await getPortalSession(authHeader)

    if (!session) {
      return Response.json(apiError('Invalid or expired session', 'INVALID_SESSION'), {
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    // Get packages for this site
    let packagesQuery = supabaseAdmin
      .from('packages')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('sort_order')

    if (session.site_id) {
      // Get packages assigned to this site
      const { data: sitePackages } = await supabaseAdmin
        .from('site_packages')
        .select('package_id')
        .eq('site_id', session.site_id)
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

    return Response.json(apiSuccess(packages || []))

  } catch (error) {
    logError(error, 'Portal packages')
    return Response.json(apiError('Failed to load packages'), { 
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR 
    })
  }
}