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
      .select('id,client_mac,ap_mac,ssid_name,status,duration_seconds,authorized_at,expires_at,sites!client_authorizations_site_id_fkey(name),payment_transactions!client_authorizations_transaction_id_fkey(packages!payment_transactions_package_id_fkey(name))')
      .order('authorized_at', { ascending: false })
      .limit(200)

    if (admin.role === 'SITE_ADMIN' && admin.sites?.length) query = query.in('site_id', admin.sites)

    const { data, error } = await query
    if (error) throw error

    let paymentQuery = supabaseAdmin
      .from('payment_transactions')
      .select('id,reference,status,client_mac,ap_mac,ssid_name,amount_tzs,phone_number,created_at,error_code,error_message,sites!payment_transactions_site_id_fkey(name),packages!payment_transactions_package_id_fkey(name)')
      .in('status', ['PENDING', 'PAYMENT_INITIATED', 'PAYMENT_SUCCESS', 'OMADA_AUTHORIZING', 'AUTHORIZATION_FAILED'])
      .order('created_at', { ascending: false })
      .limit(200)
    if (admin.role === 'SITE_ADMIN' && admin.sites?.length) paymentQuery = paymentQuery.in('site_id', admin.sites)
    const { data: payments, error: paymentError } = await paymentQuery
    if (paymentError) throw paymentError

    // Flatten nested package name
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      packages: r.payment_transactions?.packages ?? null,
      payment_transactions: undefined
    }))

    return Response.json(apiSuccess([
      ...rows.map((row: any) => ({ ...row, record_type: 'AUTHORIZATION' })),
      ...(payments ?? []).map((payment: any) => ({
        ...payment,
        record_type: 'PAYMENT',
        sites: payment.sites,
        packages: payment.packages
      }))
    ]))
  } catch (e) {
    logError(e, 'GET /admin/sessions')
    return Response.json(apiError('Failed to load sessions'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
