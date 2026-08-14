import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    const sp = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '25')))
    const offset = (page - 1) * limit

    let query = supabaseAdmin
      .from('audit_logs')
      .select('id,action,details,ip_address,created_at,admins!audit_logs_admin_id_fkey(email),sites!audit_logs_site_id_fkey(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (admin.role === 'SITE_ADMIN' && admin.sites?.length) query = query.in('site_id', admin.sites)
    if (sp.get('action')) query = query.eq('action', sp.get('action')!)

    const { data, count, error } = await query
    if (error) throw error

    return Response.json({
      success: true,
      data,
      pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) }
    })
  } catch (e) {
    logError(e, 'GET /admin/audit-logs')
    return Response.json(apiError('Failed to load audit logs'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
