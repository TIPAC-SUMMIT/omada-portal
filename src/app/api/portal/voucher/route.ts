import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { authorizeOmadaVoucher } from '@/lib/services/omada-open-api'
import { hashSessionToken, apiSuccess, apiError, logError } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken : ''
    const voucherCode = typeof body.voucherCode === 'string' ? body.voucherCode.trim() : ''

    if (sessionToken.length < 32 || !voucherCode) {
      return Response.json(apiError('Session token and voucher code are required', 'VALIDATION_ERROR'), {
        status: HTTP_STATUS.BAD_REQUEST,
      })
    }

    const { data: session, error } = await supabaseAdmin
      .from('portal_sessions')
      .select('id, client_mac, ap_mac, ssid_name, site_name, radio_id, redirect_url')
      .eq('session_token_hash', hashSessionToken(sessionToken))
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (error || !session) {
      return Response.json(apiError('Invalid or expired session', 'INVALID_SESSION'), {
        status: HTTP_STATUS.UNAUTHORIZED,
      })
    }

    if (!session.radio_id) {
      return Response.json(apiError('Missing Omada radio information', 'INVALID_SESSION'), {
        status: HTTP_STATUS.BAD_REQUEST,
      })
    }

    await authorizeOmadaVoucher({
      clientMac: session.client_mac,
      apMac: session.ap_mac,
      ssidName: session.ssid_name,
      radioId: session.radio_id,
      site: session.site_name,
      voucherCode,
    })

    await supabaseAdmin
      .from('portal_sessions')
      .update({ status: 'AUTHORIZED' })
      .eq('id', session.id)

    return Response.json(apiSuccess({ redirectUrl: session.redirect_url }))
  } catch (error) {
    logError(error, 'Manual voucher authorization')
    return Response.json(apiError(
      error instanceof Error ? error.message : 'Voucher authorization failed',
      'VOUCHER_AUTHORIZATION_FAILED'
    ), { status: HTTP_STATUS.BAD_REQUEST })
  }
}
