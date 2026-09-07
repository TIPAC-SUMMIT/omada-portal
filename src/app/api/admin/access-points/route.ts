import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { apiError, apiSuccess, logError } from '@/lib/utils'
import { macAddressSchema } from '@/lib/validation'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

  try {
    let query = supabaseAdmin
      .from('access_points')
      .select('*,sites:site_id(name),omada_controllers:controller_id(name)')
      .order('name')
    const controllerId = request.nextUrl.searchParams.get('controller_id')
    const siteId = request.nextUrl.searchParams.get('site_id')
    if (controllerId) query = query.eq('controller_id', controllerId)
    if (siteId) query = query.eq('site_id', siteId)
    if (admin.role === 'SITE_ADMIN' && admin.sites?.length) query = query.in('site_id', admin.sites)
    const { data, error } = await query
    if (error) throw error
    return Response.json(apiSuccess(data ?? []))
  } catch (error) {
    logError(error, 'GET /admin/access-points')
    return Response.json(apiError('Failed to load access points'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
  if (admin.role !== 'SUPER_ADMIN') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

  try {
    const body = await request.json()
    const compactMac = macAddressSchema.parse(body.ap_mac)
    const apMac = compactMac.match(/.{2}/g)!.join(':')
    if (!body.site_id || !body.controller_id) {
      return Response.json(apiError('site_id and controller_id are required'), { status: HTTP_STATUS.BAD_REQUEST })
    }
    const { data: controller } = await supabaseAdmin
      .from('omada_controllers')
      .select('id,site_id')
      .eq('id', body.controller_id)
      .single()
    if (!controller) return Response.json(apiError('Controller not found'), { status: HTTP_STATUS.NOT_FOUND })

    const { data, error } = await supabaseAdmin
      .from('access_points')
      .upsert({
        site_id: body.site_id,
        controller_id: body.controller_id,
        ap_mac: apMac,
        name: body.name?.trim() || null,
        model: body.model?.trim() || null,
        is_active: body.is_active !== false,
      }, { onConflict: 'site_id,ap_mac' })
      .select('*')
      .single()
    if (error) throw error
    return Response.json(apiSuccess(data), { status: HTTP_STATUS.CREATED })
  } catch (error) {
    logError(error, 'POST /admin/access-points')
    return Response.json(apiError('Failed to save access point'), { status: HTTP_STATUS.BAD_REQUEST })
  }
}
