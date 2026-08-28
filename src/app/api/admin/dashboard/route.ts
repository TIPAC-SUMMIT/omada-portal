/**
 * GET /api/admin/dashboard
 */
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin, canAccessSite } from '@/lib/auth'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    const today = new Date(); today.setHours(0,0,0,0)
    const todayISO = today.toISOString()

    // Build site filter for SITE_ADMIN
    const siteFilter = admin.role === 'SITE_ADMIN' ? admin.sites ?? [] : null

    // Total revenue (AUTHORIZED transactions)
    let revenueQuery = supabaseAdmin.from('payment_transactions').select('amount_tzs').eq('status', 'AUTHORIZED')
    if (siteFilter) revenueQuery = revenueQuery.in('site_id', siteFilter)
    const { data: revenueRows } = await revenueQuery
    const totalRevenue = revenueRows?.reduce((s, r) => s + r.amount_tzs, 0) ?? 0

    // Successful / failed counts
    let successQuery = supabaseAdmin.from('payment_transactions').select('id', { count: 'exact', head: true }).eq('status', 'AUTHORIZED')
    if (siteFilter) successQuery = successQuery.in('site_id', siteFilter)
    const { count: successfulPayments } = await successQuery

    let failedQuery = supabaseAdmin.from('payment_transactions').select('id', { count: 'exact', head: true })
      .in('status', ['PAYMENT_FAILED','PAYMENT_CANCELLED','PAYMENT_TIMEOUT','AUTHORIZATION_FAILED'])
    if (siteFilter) failedQuery = failedQuery.in('site_id', siteFilter)
    const { count: failedPayments } = await failedQuery

    let pendingQuery = supabaseAdmin.from('payment_transactions').select('id', { count: 'exact', head: true })
      .in('status', ['PENDING', 'PAYMENT_INITIATED', 'PAYMENT_SUCCESS', 'OMADA_AUTHORIZING'])
    if (siteFilter) pendingQuery = pendingQuery.in('site_id', siteFilter)
    const { count: pendingPayments } = await pendingQuery

    let authorizationFailureQuery = supabaseAdmin.from('payment_transactions').select('id', { count: 'exact', head: true })
      .eq('status', 'AUTHORIZATION_FAILED')
    if (siteFilter) authorizationFailureQuery = authorizationFailureQuery.in('site_id', siteFilter)
    const { count: authorizationFailures } = await authorizationFailureQuery

    // Active clients
    let activeQuery = supabaseAdmin.from('client_authorizations').select('id', { count: 'exact', head: true })
      .eq('status', 'ACTIVE').gt('expires_at', new Date().toISOString())
    if (siteFilter) activeQuery = activeQuery.in('site_id', siteFilter)
    const { count: activeClients } = await activeQuery

    // Expired sessions
    let expiredQuery = supabaseAdmin.from('client_authorizations').select('id', { count: 'exact', head: true })
      .in('status', ['EXPIRED','REVOKED'])
    if (siteFilter) expiredQuery = expiredQuery.in('site_id', siteFilter)
    const { count: expiredSessions } = await expiredQuery

    // Today transactions
    let todayTxQuery = supabaseAdmin.from('payment_transactions').select('amount_tzs,status').gte('created_at', todayISO)
    if (siteFilter) todayTxQuery = todayTxQuery.in('site_id', siteFilter)
    const { data: todayTxRows } = await todayTxQuery
    const todayTransactions = todayTxRows?.length ?? 0
    const revenueToday = todayTxRows?.filter(r => r.status === 'AUTHORIZED').reduce((s, r) => s + r.amount_tzs, 0) ?? 0

    const total = (successfulPayments ?? 0) + (failedPayments ?? 0)
    const paymentSuccessRate = total > 0 ? Math.round(((successfulPayments ?? 0) / total) * 100) : 0

    // Revenue by site
    const { data: sites } = await supabaseAdmin.from('sites').select('id, name').eq('status', 'ACTIVE')
    const siteStats = await Promise.all((sites ?? [])
      .filter(s => !siteFilter || siteFilter.includes(s.id))
      .map(async s => {
        const { data: txRows } = await supabaseAdmin.from('payment_transactions')
          .select('amount_tzs').eq('site_id', s.id).eq('status', 'AUTHORIZED')
        const { count: active } = await supabaseAdmin.from('client_authorizations')
          .select('id', { count: 'exact', head: true }).eq('site_id', s.id).eq('status', 'ACTIVE').gt('expires_at', new Date().toISOString())
        return {
          siteId: s.id, siteName: s.name,
          revenue: txRows?.reduce((sum, r) => sum + r.amount_tzs, 0) ?? 0,
          transactions: txRows?.length ?? 0,
          activeClients: active ?? 0
        }
      })
    )

    // Package stats
    const { data: packages } = await supabaseAdmin.from('packages').select('id, name').eq('status', 'ACTIVE')
    const packageStats = await Promise.all((packages ?? []).map(async p => {
      let q = supabaseAdmin.from('payment_transactions').select('amount_tzs').eq('package_id', p.id).eq('status', 'AUTHORIZED')
      if (siteFilter) q = q.in('site_id', siteFilter)
      const { data: rows } = await q
      return { packageId: p.id, packageName: p.name, sales: rows?.length ?? 0, revenue: rows?.reduce((s, r) => s + r.amount_tzs, 0) ?? 0 }
    }))

    return Response.json(apiSuccess({
      stats: {
        totalRevenue,
        successfulPayments: successfulPayments ?? 0,
        failedPayments: failedPayments ?? 0,
        pendingPayments: pendingPayments ?? 0,
        authorizationFailures: authorizationFailures ?? 0,
        activeClients: activeClients ?? 0,
        expiredSessions: expiredSessions ?? 0,
        todayTransactions,
        revenueToday,
        paymentSuccessRate
      },
      siteStats: siteStats.sort((a, b) => b.revenue - a.revenue),
      packageStats: packageStats.sort((a, b) => b.sales - a.sales)
    }))
  } catch (error) {
    logError(error, 'Admin dashboard')
    return Response.json(apiError('Failed to load dashboard'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
