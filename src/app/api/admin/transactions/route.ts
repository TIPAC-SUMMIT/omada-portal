import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    const sp = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20')))
    const search = sp.get('search')?.trim()
    const siteId = sp.get('site_id')
    const status = sp.get('status')
    const offset = (page - 1) * limit

    let query = supabaseAdmin
      .from('payment_transactions')
      .select('id,reference,status,amount_tzs,phone_number,client_mac,created_at,authorized_at,expires_at,sites!payment_transactions_site_id_fkey(name),packages!payment_transactions_package_id_fkey(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (admin.role === 'SITE_ADMIN' && admin.sites?.length) query = query.in('site_id', admin.sites)
    if (siteId) query = query.eq('site_id', siteId)
    if (status) query = query.eq('status', status)
    if (search) query = query.or(`reference.ilike.%${search}%,phone_number.ilike.%${search}%`)

    const { data, count, error } = await query
    if (error) throw error

    return Response.json({
      success: true,
      data,
      pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) }
    })
  } catch (e) {
    logError(e, 'GET /admin/transactions')
    return Response.json(apiError('Failed to load transactions'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
