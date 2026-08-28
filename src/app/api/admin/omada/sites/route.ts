import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { listOmadaSites } from '@/lib/services/omada-open-api'
import { apiError, apiSuccess, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) {
    return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
  }

  try {
    const sites = await listOmadaSites()
    return Response.json(apiSuccess(sites))
  } catch (error) {
    logError(error, 'GET /admin/omada/sites')
    return Response.json(
      apiError(error instanceof Error ? error.message : 'Failed to retrieve Omada sites', 'OMADA_ERROR'),
      { status: HTTP_STATUS.SERVICE_UNAVAILABLE }
    )
  }
}
