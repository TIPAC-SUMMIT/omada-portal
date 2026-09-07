import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { apiError, apiSuccess, logError } from '@/lib/utils'
import { macAddressSchema } from '@/lib/validation'
import { HTTP_STATUS } from '@/lib/constants'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request)
  if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
  if (admin.role !== 'SUPER_ADMIN') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })
  try {
    const body = await request.json()
    const updates: Record<string, unknown> = {}
    if (body.ap_mac !== undefined) {
      const compactMac = macAddressSchema.parse(body.ap_mac)
      updates.ap_mac = compactMac.match(/.{2}/g)!.join(':')
    }
    for (const key of ['site_id', 'controller_id', 'name', 'model', 'is_active']) {
      if (body[key] !== undefined) updates[key] = typeof body[key] === 'string' ? body[key].trim() || null : body[key]
    }
    const { data, error } = await supabaseAdmin.from('access_points').update(updates).eq('id', params.id).select('*').single()
    if (error) throw error
    return Response.json(apiSuccess(data))
  } catch (error) {
    logError(error, 'PATCH /admin/access-points/[id]')
    return Response.json(apiError('Failed to update access point'), { status: HTTP_STATUS.BAD_REQUEST })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(request)
  if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
  if (admin.role !== 'SUPER_ADMIN') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })
  try {
    const { error } = await supabaseAdmin.from('access_points').delete().eq('id', params.id)
    if (error) throw error
    return Response.json(apiSuccess({ deleted: true }))
  } catch (error) {
    logError(error, 'DELETE /admin/access-points/[id]')
    return Response.json(apiError('Failed to delete access point'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
