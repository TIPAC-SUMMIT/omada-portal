/**
 * Package Selection API
 * POST /api/portal/packages/select
 * 
 * Select package for portal session
 */

import { NextRequest } from 'next/server'
import { selectPackageSchema } from '@/lib/validation'
import { supabaseAdmin } from '@/lib/supabase'
import { 
  hashSessionToken, 
  apiSuccess, 
  apiError, 
  validateRequestBody,
  logError
} from '@/lib/utils'
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

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const session = await getPortalSession(authHeader)

    if (!session) {
      return Response.json(apiError('Invalid or expired session', 'INVALID_SESSION'), {
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    // Parse and validate request — only packageId comes in the body;
    // session token is in the Authorization header (already verified above)
    const body = await request.json()
    const { packageId } = body

    if (!packageId || typeof packageId !== 'string') {
      return Response.json(apiError('packageId is required', 'VALIDATION_ERROR'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Must be a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(packageId)) {
      return Response.json(apiError('Invalid packageId format', 'VALIDATION_ERROR'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const data = { packageId }
    
    // Verify package exists and is available
    const { data: pkg, error: packageError } = await supabaseAdmin
      .from('packages')
      .select('*')
      .eq('id', data.packageId)
      .eq('status', 'ACTIVE')
      .single()

    if (packageError || !pkg) {
      return Response.json(apiError('Package not found or unavailable', 'PACKAGE_NOT_AVAILABLE'), {
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // If site is assigned, verify package is available for this site
    if (session.site_id) {
      const { data: sitePackages, error: sitePackagesError } = await supabaseAdmin
        .from('site_packages')
        .select('package_id')
        .eq('site_id', session.site_id)
        .eq('is_active', true)
      
      if (sitePackagesError) {
        throw new Error(`Failed to verify site packages: ${sitePackagesError.message}`)
      }

      // An empty assignment means the site uses the global active package list,
      // matching the package list returned during session creation.
      if (sitePackages.length > 0 && !sitePackages.some(sp => sp.package_id === data.packageId)) {
        return Response.json(apiError('Package not available for this site', 'PACKAGE_NOT_AVAILABLE'), {
          status: HTTP_STATUS.FORBIDDEN
        })
      }
    }

    // Update session with selected package
    const { error: updateError } = await supabaseAdmin
      .from('portal_sessions')
      .update({
        selected_package_id: data.packageId,
        status: 'PACKAGE_SELECTED'
      })
      .eq('id', session.id)

    if (updateError) {
      throw new Error(`Failed to update session: ${updateError.message}`)
    }

    return Response.json(apiSuccess({ 
      packageId: data.packageId,
      packageName: pkg.name,
      price: pkg.price_tzs,
      duration: pkg.duration_seconds
    }))

  } catch (error) {
    logError(error, 'Package selection')
    
    if (error instanceof Error && error.message.includes('Validation failed')) {
      return Response.json(apiError(error.message, 'VALIDATION_ERROR'), { 
        status: HTTP_STATUS.BAD_REQUEST 
      })
    }

    return Response.json(apiError('Failed to select package'), { 
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR 
    })
  }
}