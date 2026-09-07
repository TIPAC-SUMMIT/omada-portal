import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    let query = supabaseAdmin
      .from('client_authorizations')
      .select('id,transaction_id,client_mac,ap_mac,ssid_name,status,duration_seconds,authorized_at,expires_at,controller_id,access_point_id,controller_name,ap_mac_resolved,ap_name,sites!client_authorizations_site_id_fkey(name),payment_transactions!client_authorizations_transaction_id_fkey(reference,phone_number,amount_tzs,voucher_code,packages!payment_transactions_package_id_fkey(name))')
      .eq('status', 'ACTIVE')
      .gt('expires_at', new Date().toISOString())
      .order('authorized_at', { ascending: false })

    if (admin.role === 'SITE_ADMIN') {
      if (!admin.sites?.length) return Response.json(apiSuccess([]))
      query = query.in('site_id', admin.sites)
    }
    const controllerId = request.nextUrl.searchParams.get('controller_id')
    const accessPointId = request.nextUrl.searchParams.get('access_point_id')
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? '1'))
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? '20')))
    if (controllerId) query = query.eq('controller_id', controllerId)
    if (accessPointId) query = query.eq('access_point_id', accessPointId)

    const { data, error } = await query.range((page - 1) * limit, page * limit - 1)
    if (error) throw error

    let paymentQuery = supabaseAdmin
      .from('payment_transactions')
      .select('id,reference,status,client_mac,ap_mac,ssid_name,amount_tzs,phone_number,created_at,error_code,error_message,controller_id,access_point_id,controller_name,ap_mac_resolved,ap_name,sites!payment_transactions_site_id_fkey(name),packages!payment_transactions_package_id_fkey(name)')
      .in('status', ['PENDING', 'PAYMENT_INITIATED', 'PAYMENT_SUCCESS', 'OMADA_AUTHORIZING', 'AUTHORIZATION_FAILED'])
      .order('created_at', { ascending: false })
    if (admin.role === 'SITE_ADMIN') {
      if (!admin.sites?.length) return Response.json(apiSuccess([]))
      paymentQuery = paymentQuery.in('site_id', admin.sites)
    }
    if (controllerId) paymentQuery = paymentQuery.eq('controller_id', controllerId)
    if (accessPointId) paymentQuery = paymentQuery.eq('access_point_id', accessPointId)
    const { data: payments, error: paymentError } = await paymentQuery.range((page - 1) * limit, page * limit - 1)
    if (paymentError) throw paymentError

    // Flatten nested package name
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      packages: r.payment_transactions?.packages ?? null,
      reference: r.payment_transactions?.reference ?? null,
      phone_number: r.payment_transactions?.phone_number ?? null,
      amount_tzs: r.payment_transactions?.amount_tzs ?? null,
      voucher_code: r.payment_transactions?.voucher_code ?? null,
      payment_transactions: undefined
    }))

    const combined = [
      ...rows.map((row: any) => ({ ...row, record_type: 'AUTHORIZATION' })),
      ...(payments ?? []).map((payment: any) => ({
        ...payment,
        record_type: 'PAYMENT',
        sites: payment.sites,
        packages: payment.packages
      }))
    ]
    return Response.json({
      success: true,
      data: combined,
      pagination: { page, limit, hasNextPage: combined.length === limit }
    })
  } catch (e) {
    logError(e, 'GET /admin/sessions')
    return Response.json(apiError('Failed to load sessions'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
