/**
 * GET /api/admin/sites
 * POST /api/admin/sites
 */
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { createSiteSchema } from '@/lib/validation'
import { apiSuccess, apiError, validateRequestBody, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    let query = supabaseAdmin.from('sites').select('*').order('name')
    if (admin.role === 'SITE_ADMIN' && admin.sites?.length) {
      query = query.in('id', admin.sites)
    }

    const { data, error } = await query
    if (error) throw error
    return Response.json(apiSuccess(data))
  } catch (e) {
    logError(e, 'GET /admin/sites')
    return Response.json(apiError('Failed to load sites'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role !== 'SUPER_ADMIN') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const body = await request.json()
    const data = validateRequestBody(createSiteSchema)(body)

    const { data: site, error } = await supabaseAdmin.from('sites').insert(data).select('*').single()
    if (error) throw error

    await supabaseAdmin.from('audit_logs').insert({ action: 'SITE_CREATED', admin_id: admin.sub, site_id: site.id, details: { name: site.name } })
    return Response.json(apiSuccess(site), { status: HTTP_STATUS.CREATED })
  } catch (e: any) {
    logError(e, 'POST /admin/sites')
    if (e?.code === '23505') return Response.json(apiError('Slug already exists'), { status: HTTP_STATUS.CONFLICT })
    return Response.json(apiError('Failed to create site'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
