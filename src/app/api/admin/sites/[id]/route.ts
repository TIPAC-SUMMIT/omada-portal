/**
 * PATCH /api/admin/sites/[id]
 * DELETE /api/admin/sites/[id]
 */
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin, canAccessSite } from '@/lib/auth'
import { updateSiteSchema } from '@/lib/validation'
import { apiSuccess, apiError, validateRequestBody, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (!canAccessSite(admin, params.id)) return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const body = await request.json()
    const data = validateRequestBody(updateSiteSchema)(body)

    const { data: site, error } = await supabaseAdmin.from('sites').update(data).eq('id', params.id).select('*').single()
    if (error) throw error

    await supabaseAdmin.from('audit_logs').insert({ action: 'SITE_UPDATED', admin_id: admin.sub, site_id: params.id, details: data })
    return Response.json(apiSuccess(site))
  } catch (e) {
    logError(e, 'PATCH /admin/sites/[id]')
    return Response.json(apiError('Failed to update site'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role !== 'SUPER_ADMIN') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const { error } = await supabaseAdmin.from('sites').delete().eq('id', params.id)
    if (error) throw error

    await supabaseAdmin.from('audit_logs').insert({ action: 'SITE_DELETED', admin_id: admin.sub, details: { siteId: params.id } })
    return Response.json(apiSuccess({ deleted: true }))
  } catch (e) {
    logError(e, 'DELETE /admin/sites/[id]')
    return Response.json(apiError('Failed to delete site'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
