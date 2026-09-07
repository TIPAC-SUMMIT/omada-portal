/**
 * Admin Controllers API
 * GET  /api/admin/controllers - List controllers
 * POST /api/admin/controllers - Create controller
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { encryptCredential, validateEncryptionKey } from '@/lib/encryption'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    const siteId = request.nextUrl.searchParams.get('siteId')

    let query = supabaseAdmin
      .from('omada_controllers')
      .select(`
        id, site_id, name,
        cloud_api_url, cloud_api_client_id, cloud_api_omadac_id,
        controller_url, controller_id,
        is_active, last_seen_at, last_error_message,
        sync_status, synced_at, created_at, updated_at
      `)
      .order('name')

    if (siteId) {
      query = query.eq('site_id', siteId)
    }

    const { data: controllers, error } = await query

    if (error) {
      throw error
    }

    const controllerIds = (controllers ?? []).map(controller => controller.id)
    const { data: siteRows, error: siteError } = controllerIds.length
      ? await supabaseAdmin
        .from('sites')
        .select('id, name, primary_controller_id')
        .in('primary_controller_id', controllerIds)
      : { data: [], error: null }
    if (siteError) throw siteError

    const sitesByController = new Map<string, Array<{ id: string; name: string }>>()
    for (const site of siteRows ?? []) {
      if (!site.primary_controller_id) continue
      const list = sitesByController.get(site.primary_controller_id) ?? []
      list.push({ id: site.id, name: site.name })
      sitesByController.set(site.primary_controller_id, list)
    }

    // Note: cloud_api_client_secret_ciphertext and password ciphertexts are NOT returned
    return Response.json(apiSuccess({
      controllers: (controllers || []).map(controller => ({
        ...controller,
        sites: sitesByController.get(controller.id) ?? [],
        site_count: sitesByController.get(controller.id)?.length ?? 0
      }))
    }))
  } catch (error) {
    logError(error, 'Controllers list')
    return Response.json(
      apiError('Failed to list controllers'),
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role !== 'SUPER_ADMIN') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    // Validate encryption key is available
    const keyValidation = validateEncryptionKey()
    if (!keyValidation.valid) {
      return Response.json(
        apiError(keyValidation.error || 'Encryption key not configured', 'ENCRYPTION_KEY_MISSING'),
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    const body = await request.json()
    const {
      site_id,
      name,
      cloud_api_url,
      cloud_api_client_id,
      cloud_api_client_secret,
      cloud_api_omadac_id,
      controller_url,
      controller_id,
      controller_username,
      controller_password
    } = body

    // Validation
    if (!name) {
      return Response.json(
        apiError('name is required'),
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    if (site_id) {
      const { data: site, error: siteError } = await supabaseAdmin
        .from('sites')
        .select('id')
        .eq('id', site_id)
        .single()

      if (siteError || !site) {
        return Response.json(
          apiError('Site not found'),
          { status: HTTP_STATUS.NOT_FOUND }
        )
      }
    }

    // Encrypt credentials
    let cloudApiClientSecretCiphertext: string | null = null
    let controllerUsernameCiphertext: string | null = null
    let controllerPasswordCiphertext: string | null = null

    if (cloud_api_client_secret) {
      try {
        cloudApiClientSecretCiphertext = encryptCredential(cloud_api_client_secret)
      } catch (error) {
        return Response.json(
          apiError('Failed to encrypt cloud API client secret'),
          { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
        )
      }
    }

    if (controller_username && controller_password) {
      try {
        controllerUsernameCiphertext = encryptCredential(controller_username)
        controllerPasswordCiphertext = encryptCredential(controller_password)
      } catch (error) {
        return Response.json(
          apiError('Failed to encrypt controller credentials'),
          { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
        )
      }
    }

    const { data: newController, error: createError } = await supabaseAdmin
      .from('omada_controllers')
      .insert({
        site_id: site_id || null,
        name,
        cloud_api_url: cloud_api_url || null,
        cloud_api_client_id: cloud_api_client_id || null,
        cloud_api_client_secret_ciphertext: cloudApiClientSecretCiphertext,
        cloud_api_omadac_id: cloud_api_omadac_id || null,
        controller_url: controller_url || null,
        controller_id: controller_id || null,
        controller_username_ciphertext: controllerUsernameCiphertext,
        controller_password_ciphertext: controllerPasswordCiphertext,
        is_active: true,
        sync_status: 'pending'
      })
      .select('id, site_id, name, cloud_api_url, cloud_api_client_id, cloud_api_omadac_id, controller_url, controller_id, is_active, sync_status, created_at')
      .single()

    if (createError) {
      throw createError
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CONTROLLER_CREATED',
      admin_id: admin.sub,
      site_id: site_id || null,
      details: { name, controller_id: newController?.id }
    })

    return Response.json(apiSuccess(newController), { status: HTTP_STATUS.CREATED })
  } catch (error) {
    logError(error, 'Controller creation')
    return Response.json(
      apiError('Failed to create controller'),
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    )
  }
}
