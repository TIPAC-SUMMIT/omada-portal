import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  try {
    const { reference } = params

    if (!reference || !/^WIFI-\d{8}-[A-F0-9]{8}$/.test(reference)) {
      return Response.json(apiError('Invalid transaction reference'), { status: HTTP_STATUS.BAD_REQUEST })
    }

    const { data: transaction, error } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, reference, status, error_message, voucher_code, portal_session_id')
      .eq('reference', reference)
      .single()

    if (error || !transaction) {
      return Response.json(apiError('Transaction not found', 'TRANSACTION_NOT_FOUND'), { status: HTTP_STATUS.NOT_FOUND })
    }

    const voucherCode = transaction.voucher_code || undefined

    let message: string
    let redirectUrl: string | undefined
    let portalUrl: string | undefined

    switch (transaction.status) {
      case 'PENDING':            message = 'Sending payment prompt to your phone…'; break
      case 'PAYMENT_INITIATED':  message = 'Please enter your PIN on your phone.'; break
      case 'PAYMENT_SUCCESS':
      case 'OMADA_AUTHORIZING':  message = voucherCode ? 'Payment confirmed! Your voucher is ready.' : 'Payment confirmed. Activating access…'; break
      case 'AUTHORIZED':
        message = voucherCode ? 'Payment successful! Copy your voucher code.' : 'Internet access activated!'
        if (transaction.portal_session_id) {
          const { data: ps } = await supabaseAdmin
            .from('portal_sessions')
            .select('client_mac, ap_mac, ssid_name, radio_id, vid, redirect_url, portal_auth_url')
            .eq('id', transaction.portal_session_id)
            .single()
          redirectUrl = ps?.redirect_url ?? undefined
          if (ps?.portal_auth_url) {
            const params = new URLSearchParams({
              clientMac: ps.client_mac,
              apMac: ps.ap_mac,
              ssidName: ps.ssid_name,
              tp: ps.portal_auth_url,
            })
            if (ps.radio_id) params.set('radioId', ps.radio_id)
            if (ps.vid) params.set('vid', ps.vid)
            if (ps.redirect_url) params.set('redirectUrl', ps.redirect_url)
            portalUrl = `/portal?${params.toString()}`
          }
        }
        break
      case 'PAYMENT_FAILED':     message = 'Payment failed. Please try again.'; break
      case 'PAYMENT_CANCELLED':  message = 'Payment was cancelled.'; break
      case 'PAYMENT_TIMEOUT':    message = 'Payment timed out. Please try again.'; break
      case 'AUTHORIZATION_FAILED': message = 'Payment received. Contact support if issue persists.'; break
      case 'EXPIRED':            message = 'Transaction expired. Please start over.'; break
      default:                   message = 'Processing…'
    }

    return Response.json(apiSuccess({
      reference: transaction.reference,
      status: transaction.status,
      message,
      ...(voucherCode  && { voucherCode }),
      ...(redirectUrl  && { redirectUrl }),
      ...(portalUrl && { portalUrl })
    }))
  } catch (error) {
    logError(error, 'Payment status check')
    return Response.json(apiError('Failed to check payment status'), { status: HTTP_STATUS.INTERNAL_SERVER_ERROR })
  }
}
