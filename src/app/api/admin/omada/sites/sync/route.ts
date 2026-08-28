import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { listOmadaSites } from '@/lib/services/omada-open-api'
import { apiError, apiSuccess, logError, slugify } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      return Response.json(apiError(admin ? 'Forbidden' : 'Unauthorized'), {
        status: admin ? HTTP_STATUS.FORBIDDEN : HTTP_STATUS.UNAUTHORIZED
      })
    }

    const omadaSites = await listOmadaSites()
    const synced = []
    for (const omadaSite of omadaSites) {
      const { data: existing } = await supabaseAdmin
        .from('sites')
        .select('id,name,slug,location,description,status,timezone,omada_site_id')
        .eq('omada_site_id', omadaSite.siteId)
        .maybeSingle()

      if (existing) {
        const { data: updated, error } = await supabaseAdmin
          .from('sites')
          .update({ name: omadaSite.name })
          .eq('id', existing.id)
          .select('*')
          .single()
        if (error) throw error
        synced.push(updated)
      } else {
        const baseSlug = slugify(omadaSite.name) || `omada-${omadaSite.siteId.slice(0, 8)}`
        let slug = baseSlug
        let suffix = 2
        while (true) {
          const { data: conflict } = await supabaseAdmin.from('sites').select('id').eq('slug', slug).maybeSingle()
          if (!conflict) break
          slug = `${baseSlug}-${suffix++}`
        }
        const { data: created, error } = await supabaseAdmin
          .from('sites')
          .insert({ name: omadaSite.name, slug, omada_site_id: omadaSite.siteId, status: 'ACTIVE' })
          .select('*')
          .single()
        if (error) throw error
        synced.push(created)
      }
    }

    await supabaseAdmin.from('audit_logs').insert({
      action: 'SITE_UPDATED',
      admin_id: admin.sub,
      details: { source: 'omada_sync', count: synced.length }
    })
    return Response.json(apiSuccess(synced))
  } catch (error) {
    logError(error, 'POST /admin/omada/sites/sync')
    return Response.json(apiError('Failed to synchronize Omada sites'), { status: HTTP_STATUS.SERVICE_UNAVAILABLE })
  }
}
