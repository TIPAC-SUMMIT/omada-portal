import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { updatePackageSchema } from '@/lib/validation'
import { apiSuccess, apiError, validateRequestBody, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role === 'VIEWER') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })
    const body = await request.json()
    const data = validateRequestBody(updatePackageSchema)(body)
    const { data: old } = await supabaseAdmin.from('packages').select('price_tzs').eq('id', params.id).single()
    const { data: pkg, error } = await supabaseAdmin.from('packages').update(data).eq('id', params.id).select('*').single()
    if (error) throw error
    const action = (old && data.price_tzs !== undefined && data.price_tzs !== old.price_tzs)
      ? 'PACKAGE_PRICE_CHANGED' : 'PACKAGE_UPDATED'
    await supabaseAdmin.from('audit_logs').insert({ action, admin_id: admin.sub, details: { packageId: params.id, changes: data } })
    return Response.json(apiSuccess(pkg))
  } catch (e) {
    logError(e, 'PATCH /admin/packages/[id]')
    return Response.json(apiError('Failed to update package'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role === 'VIEWER') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })
    const { count } = await supabaseAdmin.from('payment_transactions')
      .select('id', { count: 'exact', head: true }).eq('package_id', params.id)
    if ((count ?? 0) > 0) {
      await supabaseAdmin.from('packages').update({ status: 'DELETED' }).eq('id', params.id)
    } else {
      await supabaseAdmin.from('packages').delete().eq('id', params.id)
    }
    await supabaseAdmin.from('audit_logs').insert({ action: 'PACKAGE_DELETED', admin_id: admin.sub, details: { packageId: params.id } })
    return Response.json(apiSuccess({ deleted: true }))
  } catch (e) {
    logError(e, 'DELETE /admin/packages/[id]')
    return Response.json(apiError('Failed to delete package'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
