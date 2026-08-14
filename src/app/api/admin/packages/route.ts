/**
 * GET /api/admin/packages
 * POST /api/admin/packages
 */
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { createPackageSchema } from '@/lib/validation'
import { apiSuccess, apiError, validateRequestBody, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    const { data, error } = await supabaseAdmin.from('packages').select('*').neq('status','DELETED').order('sort_order')
    if (error) throw error
    return Response.json(apiSuccess(data))
  } catch (e) {
    logError(e, 'GET /admin/packages')
    return Response.json(apiError('Failed to load packages'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role === 'VIEWER') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const body = await request.json()
    const data = validateRequestBody(createPackageSchema)(body)

    const { data: pkg, error } = await supabaseAdmin.from('packages').insert(data).select('*').single()
    if (error) throw error

    await supabaseAdmin.from('audit_logs').insert({ action: 'PACKAGE_CREATED', admin_id: admin.sub, details: { name: pkg.name, price: pkg.price_tzs } })
    return Response.json(apiSuccess(pkg), { status: HTTP_STATUS.CREATED })
  } catch (e) {
    logError(e, 'POST /admin/packages')
    return Response.json(apiError('Failed to create package'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
