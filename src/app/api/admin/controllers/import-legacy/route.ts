import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { encryptCredential, validateEncryptionKey } from '@/lib/encryption'
import { ENV } from '@/lib/constants'
import { apiError, apiSuccess, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role !== 'SUPER_ADMIN') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const keyValidation = validateEncryptionKey()
    if (!keyValidation.valid) {
      return Response.json(apiError(keyValidation.error || 'Encryption key not configured'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
    }

    const required = [
      ENV.OMADA_API_URL, ENV.OMADA_CLIENT_ID, ENV.OMADA_CLIENT_SECRET, ENV.OMADA_OMADAC_ID,
      ENV.OMADA_SITE_ID, ENV.OMADA_CONTROLLER_URL, ENV.OMADA_CONTROLLER_ID,
      ENV.OMADA_OPERATOR_USERNAME, ENV.OMADA_OPERATOR_PASSWORD
    ]
    if (required.some(value => !value)) {
      return Response.json(apiError('The existing Omada environment configuration is incomplete'), { status: HTTP_STATUS.UNPROCESSABLE_ENTITY })
    }

    const { data: site, error: siteError } = await supabaseAdmin
      .from('sites')
      .select('id, name')
      .eq('omada_site_id', ENV.OMADA_SITE_ID)
      .maybeSingle()
    if (siteError) throw siteError
    if (!site) return Response.json(apiError(`No application site matches Omada site ${ENV.OMADA_SITE_ID}`), { status: HTTP_STATUS.NOT_FOUND })

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('omada_controllers')
      .select('id, name')
      .or(`cloud_api_omadac_id.eq.${ENV.OMADA_OMADAC_ID},controller_id.eq.${ENV.OMADA_CONTROLLER_ID}`)
      .maybeSingle()
    if (existingError) throw existingError

    let controllerId: string
    let controllerName: string
    if (existing) {
      controllerId = existing.id
      controllerName = existing.name
      const { error } = await supabaseAdmin.from('omada_controllers').update({
        site_id: site.id,
        cloud_api_url: ENV.OMADA_API_URL,
        cloud_api_client_id: ENV.OMADA_CLIENT_ID,
        cloud_api_client_secret_ciphertext: encryptCredential(ENV.OMADA_CLIENT_SECRET),
        cloud_api_omadac_id: ENV.OMADA_OMADAC_ID,
        controller_url: ENV.OMADA_CONTROLLER_URL,
        controller_id: ENV.OMADA_CONTROLLER_ID,
        controller_username_ciphertext: encryptCredential(ENV.OMADA_OPERATOR_USERNAME),
        controller_password_ciphertext: encryptCredential(ENV.OMADA_OPERATOR_PASSWORD),
        is_active: true,
        sync_status: 'pending',
        last_error_at: null,
        last_error_message: null,
        updated_at: new Date().toISOString()
      }).eq('id', controllerId)
      if (error) throw error
    } else {
      controllerName = ENV.OMADA_SITE_NAME
        ? `${ENV.OMADA_SITE_NAME} Controller`
        : 'Imported Omada Controller'
      const { data: created, error } = await supabaseAdmin.from('omada_controllers').insert({
        site_id: site.id,
        name: controllerName,
        cloud_api_url: ENV.OMADA_API_URL,
        cloud_api_client_id: ENV.OMADA_CLIENT_ID,
        cloud_api_client_secret_ciphertext: encryptCredential(ENV.OMADA_CLIENT_SECRET),
        cloud_api_omadac_id: ENV.OMADA_OMADAC_ID,
        controller_url: ENV.OMADA_CONTROLLER_URL,
        controller_id: ENV.OMADA_CONTROLLER_ID,
        controller_username_ciphertext: encryptCredential(ENV.OMADA_OPERATOR_USERNAME),
        controller_password_ciphertext: encryptCredential(ENV.OMADA_OPERATOR_PASSWORD),
        is_active: true,
        sync_status: 'pending'
      }).select('id').single()
      if (error) throw error
      controllerId = created.id
    }

    const { error: siteUpdateError } = await supabaseAdmin
      .from('sites')
      .update({ primary_controller_id: controllerId })
      .eq('id', site.id)
    if (siteUpdateError) throw siteUpdateError

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CONTROLLER_UPDATED',
      admin_id: admin.sub,
      site_id: site.id,
      details: { action: 'import_legacy_environment', controller_id: controllerId }
    })

    return Response.json(apiSuccess({
      controller_id: controllerId,
      controller_name: controllerName,
      site_name: site.name,
      message: existing ? 'Existing controller credentials refreshed and mapped' : 'Current environment controller imported and mapped'
    }))
  } catch (error) {
    logError(error, 'POST /api/admin/controllers/import-legacy')
    return Response.json(apiError('Failed to import current Omada configuration'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
