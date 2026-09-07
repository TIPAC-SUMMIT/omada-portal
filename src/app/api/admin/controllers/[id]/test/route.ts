/**
 * Controller Test Connection
 * POST /api/admin/controllers/[id]/test
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { getControllerCloudApiConfig, getControllerOperatorCredentials } from '@/lib/services/controller-routing'
import { listOmadaSites } from '@/lib/services/omada-open-api'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    const { data: controller, error: fetchError } = await supabaseAdmin
      .from('omada_controllers')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchError || !controller) {
      return Response.json(apiError('Controller not found'), { status: HTTP_STATUS.NOT_FOUND })
    }

    const errors: { [key: string]: string } = {}

    // Test Cloud API
    if (controller.cloud_api_url && controller.cloud_api_client_id && controller.cloud_api_omadac_id) {
      try {
        const cloudConfig = await getControllerCloudApiConfig(controller.id)
        if (!cloudConfig) {
          errors.cloud_api = 'Could not decrypt cloud API credentials'
        } else {
          await listOmadaSites(cloudConfig)
        }
      } catch (error) {
        errors.cloud_api = error instanceof Error ? error.message : 'Cloud API test failed'
      }
    } else {
      errors.cloud_api = 'Cloud API not configured'
    }

    // Test Controller API
    if (controller.controller_url && controller.controller_id) {
      try {
        const operatorCreds = await getControllerOperatorCredentials(controller.id)
        if (!operatorCreds) {
          errors.controller_api = 'Could not decrypt operator credentials'
        } else {
          const response = await fetch(
            `${operatorCreds.controllerUrl.replace(/\/$/, '')}/${encodeURIComponent(operatorCreds.controllerId)}/api/v2/hotspot/login`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: operatorCreds.username,
                password: operatorCreds.password
              }),
              signal: AbortSignal.timeout(10_000)
            }
          )

          if (!response.ok) {
            errors.controller_api = `Controller API returned ${response.status}`
          }
        }
      } catch (error) {
        errors.controller_api = error instanceof Error ? error.message : 'Controller API test failed'
      }
    } else {
      errors.controller_api = 'Controller API not configured'
    }

    const success = Object.keys(errors).length === 0
    const message = success
      ? 'All configured endpoints are working'
      : `Some endpoints failed: ${Object.keys(errors).join(', ')}`

    return Response.json(apiSuccess({
      success,
      message,
      errors: success ? undefined : errors
    }))
  } catch (error) {
    logError(error, 'Controller test')
    return Response.json(
      apiError('Failed to test controller'),
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    )
  }
}
