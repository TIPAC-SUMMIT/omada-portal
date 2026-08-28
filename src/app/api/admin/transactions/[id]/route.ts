import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin, canAccessSite } from '@/lib/auth'
import { authorizeOmadaClient, createOmadaVoucher } from '@/lib/services/omada-open-api'
import { apiError, apiSuccess, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

const retryableStatuses = ['PAYMENT_SUCCESS', 'OMADA_AUTHORIZING', 'AUTHORIZATION_FAILED']

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })

    const { data, error } = await supabaseAdmin
      .from('payment_transactions')
      .select('*,sites!payment_transactions_site_id_fkey(name),packages!payment_transactions_package_id_fkey(name),portal_sessions(client_mac,ap_mac,ssid_name,site_name,radio_id,redirect_url)')
      .eq('id', params.id)
      .single()
    if (error || !data) return Response.json(apiError('Transaction not found'), { status: HTTP_STATUS.NOT_FOUND })
    if (data.site_id && !canAccessSite(admin, data.site_id)) {
      return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })
    }

    const { data: authorization } = await supabaseAdmin
      .from('client_authorizations')
      .select('*')
      .eq('transaction_id', params.id)
      .maybeSingle()

    return Response.json(apiSuccess({ ...data, authorization }))
  } catch (error) {
    logError(error, 'GET /admin/transactions/[id]')
    return Response.json(apiError('Failed to load transaction'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(request)
    if (!admin) return Response.json(apiError('Unauthorized'), { status: HTTP_STATUS.UNAUTHORIZED })
    if (admin.role === 'VIEWER') return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })

    const { data: transaction, error } = await supabaseAdmin
      .from('payment_transactions')
      .select('*,portal_sessions(client_mac,ap_mac,ssid_name,site_name,radio_id)')
      .eq('id', params.id)
      .single()
    if (error || !transaction) return Response.json(apiError('Transaction not found'), { status: HTTP_STATUS.NOT_FOUND })
    if (transaction.site_id && !canAccessSite(admin, transaction.site_id)) {
      return Response.json(apiError('Forbidden'), { status: HTTP_STATUS.FORBIDDEN })
    }
    if (!retryableStatuses.includes(transaction.status)) {
      return Response.json(apiError('Only confirmed payments can be authorized', 'NOT_RETRYABLE'), { status: HTTP_STATUS.CONFLICT })
    }
    if (!Number.isInteger(transaction.duration_seconds) || transaction.duration_seconds < 60) {
      return Response.json(apiError('Transaction has an invalid access duration', 'INVALID_DURATION'), { status: HTTP_STATUS.UNPROCESSABLE_ENTITY })
    }

    const session = transaction.portal_sessions
    if (!session?.client_mac || !session.ap_mac || !session.ssid_name || !session.site_name || !session.radio_id) {
      return Response.json(apiError('Missing Omada client context', 'MISSING_PORTAL_CONTEXT'), { status: HTTP_STATUS.UNPROCESSABLE_ENTITY })
    }

    const { data: claim } = await supabaseAdmin
      .from('payment_transactions')
      .update({ status: 'OMADA_AUTHORIZING', error_code: null, error_message: null })
      .eq('id', transaction.id)
      .in('status', retryableStatuses)
      .select('id')
      .maybeSingle()
    if (!claim) {
      return Response.json(apiError('Authorization is already being processed', 'RETRY_IN_PROGRESS'), { status: HTTP_STATUS.CONFLICT })
    }

    try {
      let voucherCode = transaction.voucher_code
      let voucherGroupId = transaction.omada_voucher_group_id
      if (!voucherCode) {
        const voucher = await createOmadaVoucher(transaction.reference, transaction.duration_seconds)
        voucherCode = voucher.code
        voucherGroupId = voucher.groupId
      }

      await authorizeOmadaClient({
        clientMac: session.client_mac,
        apMac: session.ap_mac,
        ssidName: session.ssid_name,
        radioId: session.radio_id,
        site: session.site_name,
        durationSeconds: transaction.duration_seconds
      })

      const authorizedAt = new Date()
      const expiresAt = new Date(authorizedAt.getTime() + transaction.duration_seconds * 1000)
      const { error: authError } = await supabaseAdmin.from('client_authorizations').upsert({
        transaction_id: transaction.id,
        site_id: transaction.site_id,
        portal_session_id: transaction.portal_session_id,
        client_mac: session.client_mac,
        ap_mac: session.ap_mac,
        ssid_name: session.ssid_name,
        status: 'ACTIVE',
        duration_seconds: transaction.duration_seconds,
        authorized_at: authorizedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        revoked_at: null,
        revoke_reason: null
      }, { onConflict: 'transaction_id' })
      if (authError) throw authError

      await supabaseAdmin.from('payment_transactions').update({
        status: 'AUTHORIZED',
        voucher_code: voucherCode,
        omada_voucher_group_id: voucherGroupId,
        authorized_at: authorizedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        error_code: null,
        error_message: null
      }).eq('id', transaction.id)
      await supabaseAdmin.from('portal_sessions').update({ status: 'AUTHORIZED' }).eq('id', transaction.portal_session_id)
      await supabaseAdmin.from('audit_logs').insert({
        action: 'CLIENT_AUTHORIZED',
        admin_id: admin.sub,
        site_id: transaction.site_id,
        transaction_id: transaction.id,
        details: { retry: true, voucherCode, voucherGroupId }
      })

      return Response.json(apiSuccess({ status: 'AUTHORIZED', voucherCode, expiresAt: expiresAt.toISOString() }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authorization failed'
      await supabaseAdmin.from('payment_transactions').update({
        status: 'AUTHORIZATION_FAILED',
        error_code: 'OMADA_ERROR',
        error_message: message
      }).eq('id', transaction.id)
      await supabaseAdmin.from('audit_logs').insert({
        action: 'CLIENT_AUTHORIZATION_FAILED',
        admin_id: admin.sub,
        site_id: transaction.site_id,
        transaction_id: transaction.id,
        details: { retry: true, error: message }
      })
      return Response.json(apiError(message, 'AUTHORIZATION_FAILED'), { status: HTTP_STATUS.SERVICE_UNAVAILABLE })
    }
  } catch (error) {
    logError(error, 'POST /admin/transactions/[id]')
    return Response.json(apiError('Failed to retry authorization'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
