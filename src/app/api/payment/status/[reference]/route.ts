import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { malipoPayService } from '@/lib/services/malipopay'
import { authorizeOmadaClient, createOmadaVoucher } from '@/lib/services/omada-open-api'
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

    let { data: transaction, error } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, reference, status, error_message, voucher_code, portal_session_id')
      .eq('reference', reference)
      .single()

    if (error || !transaction) {
      return Response.json(apiError('Transaction not found', 'TRANSACTION_NOT_FOUND'), { status: HTTP_STATUS.NOT_FOUND })
    }

    if (['PENDING', 'PAYMENT_INITIATED'].includes(transaction.status)) {
      const { data: payment } = await supabaseAdmin
        .from('payment_transactions')
        .select('id, reference, status, amount_tzs, duration_seconds, portal_session_id, malipopay_transaction_id')
        .eq('id', transaction.id)
        .single()

      if (payment?.malipopay_transaction_id) {
        const provider = await malipoPayService.getPaymentStatus(payment.malipopay_transaction_id)
        console.log(JSON.stringify({
          level: 'info',
          event: 'PAYMENT_STATUS_RECONCILIATION',
          reference: payment.reference,
          providerReference: payment.malipopay_transaction_id,
          providerSuccess: provider.success,
          providerStatus: provider.status,
          providerAmount: provider.amount,
          providerPaidAmount: provider.paidAmount
        }))
        const confirmed = provider.success &&
          ['success', 'successful', 'paid', 'completed'].includes(provider.status || '') &&
          provider.paidAmount === payment.amount_tzs &&
          provider.amount === payment.amount_tzs &&
          (!provider.customerReference || provider.customerReference === payment.reference)

        if (confirmed) {
          const { data: claimed } = await supabaseAdmin
            .from('payment_transactions')
            .update({
              status: 'PAYMENT_SUCCESS',
              webhook_processed_at: new Date().toISOString(),
              malipopay_transaction_id: provider.reference,
              webhook_payload: { source: 'provider_reconciliation', reference: provider.reference, status: provider.status, amount: provider.amount, paidAmount: provider.paidAmount }
            })
            .eq('id', payment.id)
            .in('status', ['PENDING', 'PAYMENT_INITIATED'])
            .is('webhook_processed_at', null)
            .select('id, reference, duration_seconds, portal_session_id, site_id')
            .maybeSingle()

          if (claimed) {
            try {
              const { data: site } = await supabaseAdmin.from('sites').select('omada_site_id').eq('id', claimed.site_id).maybeSingle()
              const voucher = await createOmadaVoucher(claimed.reference, claimed.duration_seconds, site?.omada_site_id ?? undefined)
              const { data: portalSession } = await supabaseAdmin
                .from('portal_sessions')
                .select('client_mac, ap_mac, ssid_name, site_name, radio_id')
                .eq('id', claimed.portal_session_id)
                .single()
              if (!portalSession?.client_mac || !portalSession.ap_mac || !portalSession.ssid_name ||
                  !portalSession.site_name || !portalSession.radio_id) {
                throw new Error('Missing Omada client context for authorization')
              }
              await authorizeOmadaClient({
                clientMac: portalSession.client_mac,
                apMac: portalSession.ap_mac,
                ssidName: portalSession.ssid_name,
                radioId: portalSession.radio_id,
                site: portalSession.site_name,
                durationSeconds: claimed.duration_seconds,
              })
              await supabaseAdmin.from('payment_transactions').update({
                status: 'AUTHORIZED',
                voucher_code: voucher.code,
                omada_voucher_group_id: voucher.groupId,
                authorized_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + claimed.duration_seconds * 1000).toISOString(),
                error_code: null,
                error_message: null
              }).eq('id', claimed.id)
              await supabaseAdmin.from('portal_sessions').update({ status: 'AUTHORIZED' }).eq('id', claimed.portal_session_id)
            } catch (authorizationError) {
              await supabaseAdmin.from('payment_transactions').update({
                status: 'AUTHORIZATION_FAILED',
                error_code: 'OMADA_ERROR',
                error_message: authorizationError instanceof Error ? authorizationError.message : 'Authorization failed'
              }).eq('id', claimed.id)
            }

            const refreshed = await supabaseAdmin
              .from('payment_transactions')
              .select('id, reference, status, error_message, voucher_code, portal_session_id')
              .eq('id', transaction.id)
              .single()
            transaction = refreshed.data ?? transaction
          }
        }
      }
    }

    const voucherCode = transaction.voucher_code || undefined

    let message: string
    let redirectUrl: string | undefined
    let portalUrl: string | undefined

    switch (transaction.status) {
      case 'PENDING':            message = 'Inatuma ombi la malipo kwenye simu yako…'; break
      case 'PAYMENT_INITIATED':  message = 'Weka PIN yako kwenye simu.'; break
      case 'PAYMENT_SUCCESS':
      case 'OMADA_AUTHORIZING':  message = voucherCode ? 'Malipo yamethibitishwa! Vocha yako iko tayari.' : 'Malipo yamethibitishwa. Inaunganisha internet…'; break
      case 'AUTHORIZED':
        message = voucherCode ? 'Malipo yamefanikiwa! Nakili namba yako ya vocha.' : 'Internet imeunganishwa!'
        if (transaction.portal_session_id) {
          const { data: ps } = await supabaseAdmin
            .from('portal_sessions')
            .select('client_mac, ap_mac, ssid_name, site_name, portal_timestamp, gateway_mac, radio_id, vid, redirect_url, portal_auth_url')
            .eq('id', transaction.portal_session_id)
            .single()
          redirectUrl = ps?.redirect_url ?? undefined
          const params = new URLSearchParams({
            clientMac: ps?.client_mac || '',
            apMac: ps?.ap_mac || '',
            ssidName: ps?.ssid_name || '',
          })
          if (ps?.portal_auth_url) params.set('tp', ps.portal_auth_url)
          if (ps?.site_name) params.set('site', ps.site_name)
          if (ps?.portal_timestamp) params.set('t', ps.portal_timestamp)
          if (ps?.gateway_mac) params.set('gatewayMac', ps.gateway_mac)
          if (ps?.radio_id) params.set('radioId', ps.radio_id)
          if (ps?.vid) params.set('vid', ps.vid)
          if (ps?.redirect_url) params.set('redirectUrl', ps.redirect_url)
          portalUrl = `/portal?${params.toString()}`
        }
        break
      case 'PAYMENT_FAILED':     message = 'Malipo yameshindikana. Tafadhali jaribu tena.'; break
      case 'PAYMENT_CANCELLED':  message = 'Malipo yameghairiwa.'; break
      case 'PAYMENT_TIMEOUT':    message = 'Muda wa malipo umeisha. Tafadhali jaribu tena.'; break
      case 'AUTHORIZATION_FAILED': message = 'Malipo yamepokelewa. Piga simu ya msaada kama tatizo litaendelea.'; break
      case 'EXPIRED':            message = 'Muda wa muamala umeisha. Tafadhali anza upya.'; break
      default:                   message = 'Inashughulikia…'
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
