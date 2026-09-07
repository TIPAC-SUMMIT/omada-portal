/**
 * Controller Site Sync
 * POST /api/admin/controllers/[id]/sync
 * 
 * Synchronizes Omada sites from the controller's Cloud API
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { getControllerCloudApiConfig } from '@/lib/services/controller-routing'
import { listOmadaSites } from '@/lib/services/omada-open-api'
import { apiSuccess, apiError, logError, now } from '@/lib/utils'
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

    // Update sync status
    await supabaseAdmin
      .from('omada_controllers')
      .update({ sync_status: 'syncing' })
      .eq('id', controller.id)

    const errors: string[] = []
    let sitesCreated = 0
    let sitesUpdated = 0

    try {
      const cloudConfig = await getControllerCloudApiConfig(controller.id)
      if (!cloudConfig) {
        throw new Error('Cloud API not configured for this controller')
      }

      const omadaSites = await listOmadaSites(cloudConfig)

      for (const omadaSite of omadaSites) {
        try {
          const existingSite = await supabaseAdmin
            .from('sites')
            .select('id')
            .eq('omada_site_id', omadaSite.siteId)
            .eq('primary_controller_id', controller.id)
            .single()

          if (existingSite.data) {
            // Update existing site
            await supabaseAdmin
              .from('sites')
              .update({
                name: omadaSite.name,
                updated_at: now()
              })
              .eq('id', existingSite.data.id)

            sitesUpdated++
          } else {
            // Create new site
            const slug = (omadaSite.name || omadaSite.siteId)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')

            await supabaseAdmin
              .from('sites')
              .insert({
                name: omadaSite.name || `Site ${omadaSite.siteId}`,
                slug: slug || `site-${Date.now()}`,
                omada_site_id: omadaSite.siteId,
                primary_controller_id: controller.id,
                status: 'ACTIVE',
                timezone: 'Africa/Dar_es_Salaam'
              })

            sitesCreated++
          }
        } catch (error) {
          errors.push(`Failed to sync site ${omadaSite.siteId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // Update controller sync status
      await supabaseAdmin
        .from('omada_controllers')
        .update({
          sync_status: 'success',
          synced_at: now(),
          last_seen_at: now()
        })
        .eq('id', controller.id)

      await supabaseAdmin.from('audit_logs').insert({
        action: 'CONTROLLER_UPDATED',
        admin_id: admin.sub,
        details: { controller_id: controller.id, action: 'sync', sites_created: sitesCreated, sites_updated: sitesUpdated }
      })

      return Response.json(apiSuccess({
        success: errors.length === 0,
        message: errors.length === 0 ? 'Sync completed successfully' : 'Sync completed with errors',
        sites_synced: sitesCreated + sitesUpdated,
        sites_created: sitesCreated,
        sites_updated: sitesUpdated,
        errors: errors.length > 0 ? errors : undefined
      }))
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'

      await supabaseAdmin
        .from('omada_controllers')
        .update({
          sync_status: 'error',
          last_error_at: now(),
          last_error_message: errorMsg
        })
        .eq('id', controller.id)

      return Response.json(apiSuccess({
        success: false,
        message: `Sync failed: ${errorMsg}`,
        errors: [errorMsg]
      }))
    }
  } catch (error) {
    logError(error, 'Controller sync')
    return Response.json(
      apiError('Failed to sync controller'),
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    )
  }
}
