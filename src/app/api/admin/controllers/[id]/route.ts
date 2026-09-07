/**
 * Individual Controller Management
 * GET    /api/admin/controllers/[id] - Get controller
 * PATCH  /api/admin/controllers/[id] - Update controller
 * DELETE /api/admin/controllers/[id] - Delete controller
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { encryptCredential, validateEncryptionKey } from '@/lib/encryption'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    const { data: controller, error } = await supabaseAdmin
      .from('omada_controllers')
      .select(`
        id, site_id, name,
        cloud_api_url, cloud_api_client_id, cloud_api_omadac_id,
        controller_url, controller_id,
        is_active, last_seen_at, last_error_message,
        sync_status, synced_at, created_at, updated_at
      `)
      .eq('id', params.id)
      .single()

    if (error || !controller) {
      return Response.json(apiError('Controller not found'), { status: HTTP_STATUS.NOT_FOUND })
    }

    return Response.json(apiSuccess(controller))
  } catch (error) {
    logError(error, 'Controller retrieval')
    return Response.json(
      apiError('Failed to retrieve controller'),
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role !== 'SUPER_ADMIN') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const keyValidation = validateEncryptionKey()
    if (!keyValidation.valid) {
      return Response.json(
        apiError(keyValidation.error || 'Encryption key not configured'),
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      )
    }

    const body = await request.json()
    const {
      name,
      cloud_api_url,
      cloud_api_client_id,
      cloud_api_client_secret,
      cloud_api_omadac_id,
      controller_url,
      controller_id,
      controller_username,
      controller_password,
      is_active
    } = body

    const { data: current, error: fetchError } = await supabaseAdmin
      .from('omada_controllers')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchError || !current) {
      return Response.json(apiError('Controller not found'), { status: HTTP_STATUS.NOT_FOUND })
    }

    const updates: any = {
      updated_at: new Date().toISOString()
    }

    if (name !== undefined) updates.name = name
    if (cloud_api_url !== undefined) updates.cloud_api_url = cloud_api_url
    if (cloud_api_client_id !== undefined) updates.cloud_api_client_id = cloud_api_client_id
    if (cloud_api_omadac_id !== undefined) updates.cloud_api_omadac_id = cloud_api_omadac_id
    if (controller_url !== undefined) updates.controller_url = controller_url
    if (controller_id !== undefined) updates.controller_id = controller_id
    if (is_active !== undefined) updates.is_active = is_active
    if (body.site_id !== undefined) {
      if (body.site_id) {
        const { data: site } = await supabaseAdmin
          .from('sites')
          .select('id')
          .eq('id', body.site_id)
          .single()
        if (!site) return Response.json(apiError('Site not found'), { status: HTTP_STATUS.NOT_FOUND })
      }
      updates.site_id = body.site_id || null
    }

    if (cloud_api_client_secret !== undefined && cloud_api_client_secret !== '') {
      try {
        updates.cloud_api_client_secret_ciphertext = encryptCredential(cloud_api_client_secret)
      } catch (error) {
        return Response.json(
          apiError('Failed to encrypt cloud API client secret'),
          { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
        )
      }
    }

    if (controller_username !== undefined && controller_username !== '' &&
        controller_password !== undefined && controller_password !== '') {
      try {
        updates.controller_username_ciphertext = encryptCredential(controller_username)
        updates.controller_password_ciphertext = encryptCredential(controller_password)
      } catch (error) {
        return Response.json(
          apiError('Failed to encrypt controller credentials'),
          { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
        )
      }
    }

    if (controller_username !== undefined && controller_username !== '' &&
        controller_password === undefined) {
      return Response.json(
        apiError('Cannot update username without password'),
        { status: HTTP_STATUS.BAD_REQUEST }
      )
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('omada_controllers')
      .update(updates)
      .eq('id', params.id)
      .select(`
        id, site_id, name,
        cloud_api_url, cloud_api_client_id, cloud_api_omadac_id,
        controller_url, controller_id,
        is_active, last_seen_at, last_error_message,
        sync_status, synced_at, created_at, updated_at
      `)
      .single()

    if (updateError || !updated) {
      throw updateError
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CONTROLLER_UPDATED',
      admin_id: admin.sub,
      details: { controller_id: params.id, changes: updates }
    })

    return Response.json(apiSuccess(updated))
  } catch (error) {
    logError(error, 'Controller update')
    return Response.json(
      apiError('Failed to update controller'),
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role !== 'SUPER_ADMIN') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const { count: sessionsCount } = await supabaseAdmin
      .from('portal_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('controller_id', params.id)

    if ((sessionsCount ?? 0) > 0) {
      return Response.json(
        apiError('Cannot delete controller with active portal sessions'),
        { status: HTTP_STATUS.CONFLICT }
      )
    }

    const { count: transactionsCount } = await supabaseAdmin
      .from('payment_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('controller_id', params.id)
      .in('status', ['PENDING', 'PAYMENT_INITIATED', 'OMADA_AUTHORIZING', 'AUTHORIZED'])

    if ((transactionsCount ?? 0) > 0) {
      return Response.json(
        apiError('Cannot delete controller with active transactions'),
        { status: HTTP_STATUS.CONFLICT }
      )
    }

    const { error: deleteError } = await supabaseAdmin
      .from('omada_controllers')
      .delete()
      .eq('id', params.id)

    if (deleteError) {
      throw deleteError
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CONTROLLER_DELETED',
      admin_id: admin.sub,
      details: { controller_id: params.id }
    })

    return Response.json(apiSuccess({ message: 'Controller deleted' }))
  } catch (error) {
    logError(error, 'Controller deletion')
    return Response.json(
      apiError('Failed to delete controller'),
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    )
  }
}
