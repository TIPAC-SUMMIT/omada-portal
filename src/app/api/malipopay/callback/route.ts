/**
 * MalipoPay Webhook
 * POST /api/malipopay/callback
 *
 * Receives payment confirmation from MalipoPay.
 * Idempotent — safe to receive the same webhook multiple times.
 *
 * MalipoPay payload fields used:
 *   reference         → MalipoPay's own ref (ML27154)
 *   customerReference → our WIFI-... ref (what we sent)
 *   status            → "Success" | "Failed"
 *   amount            → TZS amount
 *   customer          → { phoneNumber, mno, ... }
 *
 * Signature: X-Malipopay-Signature: sha256=<hex>  HMAC-SHA256(rawBody, secret)
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { malipoPayService, mapMalipoPayStatus } from '@/lib/services/malipopay'
import { authorizeOmadaClient, createOmadaVoucher, CloudApiConfig, ControllerCredentials } from '@/lib/services/omada-open-api'
import { getControllerCloudApiConfig, getControllerOperatorCredentials } from '@/lib/services/controller-routing'
import { apiSuccess, apiError, logError, now } from '@/lib/utils'
import { HTTP_STATUS } from '@/lib/constants'

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()

  // ── Read raw body (must happen before any parsing) ─────────────────────────
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('x-malipopay-signature') ?? undefined

  console.log(JSON.stringify({
    level: 'info', event: 'WEBHOOK_RECEIVED', requestId,
    hasSignature: !!signatureHeader, bodyLength: rawBody.length
  }))

  // ── 1. Verify signature ────────────────────────────────────────────────────
  const authentic = malipoPayService.verifyWebhook(rawBody, signatureHeader)
  if (!authentic) {
    console.warn(JSON.stringify({ level: 'warn', event: 'WEBHOOK_INVALID_SIGNATURE', requestId }))
    return Response.json({ received: true }, { status: HTTP_STATUS.OK })
  }

  // ── 2. Parse JSON ──────────────────────────────────────────────────────────
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return Response.json(apiError('Invalid JSON'), { status: HTTP_STATUS.BAD_REQUEST })
  }

  // ── 3. Parse & validate payload ────────────────────────────────────────────
  const parsed = malipoPayService.parseWebhook(payload)
  if (!parsed.valid || !parsed.data) {
    console.warn(JSON.stringify({
      level: 'warn', event: 'WEBHOOK_INVALID_PAYLOAD',
      requestId, error: parsed.error
    }))
    return Response.json({ received: true }, { status: HTTP_STATUS.OK })
  }

  const { ourReference, malipoReference, status: malipoStatus, amount, phoneNumber, mno } = parsed.data

  console.log(JSON.stringify({
    level: 'info', event: 'WEBHOOK_PARSED', requestId,
    ourReference, malipoReference, malipoStatus, amount
  }))

  // ── 4. Find our transaction by customerReference (our WIFI-... ref) ────────
  const { data: transaction, error: txError } = await supabaseAdmin
    .from('payment_transactions')
    .select('*')
    .eq('reference', ourReference)
    .single()

  if (txError || !transaction) {
    console.error(JSON.stringify({
      level: 'error', event: 'WEBHOOK_TRANSACTION_NOT_FOUND',
      requestId, ourReference
    }))
    return Response.json({ received: true }, { status: HTTP_STATUS.OK })
  }

  // ── 5. Idempotency guard (atomic claim) ───────────────────────────────────
  if (transaction.webhook_processed_at) {
    console.log(JSON.stringify({
      level: 'info', event: 'WEBHOOK_DUPLICATE',
      requestId, ourReference, processedAt: transaction.webhook_processed_at
    }))

    await supabaseAdmin.from('audit_logs').insert({
      action: 'WEBHOOK_DUPLICATE', transaction_id: transaction.id,
      site_id: transaction.site_id,
      details: { ourReference, malipoReference, malipoStatus, requestId }
    })

    return Response.json({ received: true }, { status: HTTP_STATUS.OK })
  }

  // ── 6. Process normal payments and late provider success callbacks ─────────
  const mappedStatus = mapMalipoPayStatus(malipoStatus)
  const lateSuccess = mappedStatus === 'PAYMENT_SUCCESS' &&
    ['PAYMENT_FAILED', 'PAYMENT_TIMEOUT', 'EXPIRED'].includes(transaction.status)
  const processable = ['PENDING', 'PAYMENT_INITIATED'].includes(transaction.status) || lateSuccess
  if (!processable) {
    console.warn(JSON.stringify({
      level: 'warn', event: 'WEBHOOK_UNEXPECTED_STATE',
      requestId, ourReference, transactionStatus: transaction.status
    }))
    return Response.json({ received: true }, { status: HTTP_STATUS.OK })
  }

  // ── 7. Validate amount matches what we expect ──────────────────────────────
  if (amount !== transaction.amount_tzs) {
    console.error(JSON.stringify({
      level: 'error', event: 'WEBHOOK_AMOUNT_MISMATCH',
      requestId, ourReference,
      expected: transaction.amount_tzs, received: amount
    }))

    await supabaseAdmin
      .from('payment_transactions')
      .update({
        status: 'PAYMENT_FAILED',
        webhook_processed_at: now(),
        webhook_payload: payload,
        error_code: 'AMOUNT_MISMATCH',
        error_message: `Expected ${transaction.amount_tzs} TZS, received ${amount} TZS`
      })
      .eq('id', transaction.id)
      .is('webhook_processed_at', null)

    return Response.json({ received: true }, { status: HTTP_STATUS.OK })
  }

  // Handle superseding competing payments
  if (mappedStatus === 'PAYMENT_SUCCESS') {
    const { error: competingError } = await supabaseAdmin
      .from('payment_transactions')
      .update({
        status: 'EXPIRED',
        error_code: 'SUPERSEDED_BY_CONFIRMED_PAYMENT',
        error_message: 'Superseded by a confirmed payment for this portal session.'
      })
      .eq('portal_session_id', transaction.portal_session_id)
      .neq('id', transaction.id)
      .in('status', ['PENDING', 'PAYMENT_INITIATED'])

    if (competingError) {
      console.error(JSON.stringify({
        level: 'error', event: 'WEBHOOK_COMPETING_TRANSACTION_UPDATE_FAILED',
        requestId, ourReference, error: competingError.message
      }))
      return Response.json({ received: true }, { status: HTTP_STATUS.OK })
    }
  }

  // ── 8. Atomically claim the webhook ───────────────────────────────────────
  const { data: claimedRows, error: claimError } = await supabaseAdmin
    .from('payment_transactions')
    .update({
      webhook_processed_at: now(),
      webhook_payload: payload,
      malipopay_transaction_id: malipoReference,
      status: mappedStatus
    })
    .eq('id', transaction.id)
    .is('webhook_processed_at', null)
    .select('id')

  if (claimError) {
    console.error(JSON.stringify({
      level: 'error', event: 'WEBHOOK_CLAIM_FAILED',
      requestId, ourReference, error: claimError.message
    }))
    return Response.json({ received: true }, { status: HTTP_STATUS.OK })
  }

  if (!claimedRows || claimedRows.length === 0) {
    console.log(JSON.stringify({ level: 'info', event: 'WEBHOOK_CLAIM_RACE', requestId, ourReference }))
    return Response.json({ received: true }, { status: HTTP_STATUS.OK })
  }

  await supabaseAdmin.from('audit_logs').insert({
    action: 'WEBHOOK_RECEIVED', transaction_id: transaction.id,
    site_id: transaction.site_id,
    details: { ourReference, malipoReference, malipoStatus, mappedStatus, amount, mno, requestId }
  })

  // ── 9. Route based on payment outcome ─────────────────────────────────────
  if (mappedStatus === 'PAYMENT_SUCCESS') {
    await handlePaymentSuccess(transaction, malipoReference, requestId)
  } else {
    // Payment failed — reset session to PACKAGE_SELECTED so guest can retry
    await supabaseAdmin
      .from('portal_sessions')
      .update({ status: 'PACKAGE_SELECTED' })
      .eq('id', transaction.portal_session_id)

    await supabaseAdmin.from('audit_logs').insert({
      action: 'PAYMENT_FAILED', transaction_id: transaction.id,
      site_id: transaction.site_id,
      details: { ourReference, malipoStatus, requestId }
    })

    console.log(JSON.stringify({
      level: 'info', event: 'PAYMENT_FAILED',
      requestId, ourReference, malipoStatus
    }))
  }

  return Response.json({ received: true }, { status: HTTP_STATUS.OK })
}

// ─────────────────────────────────────────────────────────────────────────────
// After confirmed payment → authorize client in Omada using controller
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentSuccess(transaction: any, malipoReference: string, requestId: string) {
  await supabaseAdmin
    .from('payment_transactions')
    .update({ status: 'OMADA_AUTHORIZING' })
    .eq('id', transaction.id)

  await supabaseAdmin.from('audit_logs').insert({
    action: 'PAYMENT_RECEIVED', transaction_id: transaction.id,
    site_id: transaction.site_id,
    details: { malipoReference, requestId }
  })

  try {
    // Get the controller for this transaction
    // Use mapped credentials for new multi-controller transactions and keep
    // the existing environment configuration for legacy transactions.
    const cloudApiConfig = transaction.controller_id
      ? await getControllerCloudApiConfig(transaction.controller_id)
      : undefined
    if (transaction.controller_id && !cloudApiConfig) {
      throw new Error('Controller cloud API not configured')
    }

    // Get the site's Omada site ID
    const { data: site } = await supabaseAdmin
      .from('sites')
      .select('omada_site_id')
      .eq('id', transaction.site_id)
      .maybeSingle()

    // Generate voucher using controller-specific config
    const voucher = await createOmadaVoucher(
      transaction.reference,
      transaction.duration_seconds,
      site?.omada_site_id ?? undefined,
      cloudApiConfig || undefined
    )

    const { error: voucherError } = await supabaseAdmin
      .from('payment_transactions')
      .update({
        voucher_code: voucher.code,
        omada_voucher_group_id: voucher.groupId
      })
      .eq('id', transaction.id)
    if (voucherError) throw voucherError

    // Get portal session to get client details
    const { data: portalSession } = await supabaseAdmin
      .from('portal_sessions')
      .select('client_mac, ap_mac, ssid_name, site_name, radio_id')
      .eq('id', transaction.portal_session_id)
      .single()

    if (!portalSession?.client_mac || !portalSession.ap_mac || !portalSession.ssid_name ||
        !portalSession.site_name || !portalSession.radio_id) {
      throw new Error('Missing Omada client context for authorization')
    }

    // Get controller's operator credentials for authorization
    const operatorCreds = transaction.controller_id
      ? await getControllerOperatorCredentials(transaction.controller_id)
      : undefined
    if (transaction.controller_id && !operatorCreds) {
      throw new Error('Controller operator credentials not configured')
    }

    await authorizeOmadaClient({
      clientMac: portalSession.client_mac,
      apMac: portalSession.ap_mac,
      ssidName: portalSession.ssid_name,
      radioId: portalSession.radio_id,
      site: portalSession.site_name,
      durationSeconds: transaction.duration_seconds,
    }, operatorCreds ? {
      controllerUrl: operatorCreds.controllerUrl,
      controllerId: operatorCreds.controllerId,
      username: operatorCreds.username,
      password: operatorCreds.password
    } : undefined)

    const authorizedAt = now()
    const expiresAt = new Date(
      new Date(authorizedAt).getTime() + transaction.duration_seconds * 1000
    ).toISOString()

    // Get controller and AP names for provenance
    const { data: controller } = await supabaseAdmin
      .from('omada_controllers')
      .select('name')
      .eq('id', transaction.controller_id)
      .single()

    const { data: ap } = transaction.access_point_id ? await supabaseAdmin
      .from('access_points')
      .select('ap_mac, name, model')
      .eq('id', transaction.access_point_id)
      .single() : { data: null }

    // Store authorization with provenance
    const { error: authorizationError } = await supabaseAdmin
      .from('client_authorizations')
      .upsert({
        transaction_id: transaction.id,
        site_id: transaction.site_id,
        controller_id: transaction.controller_id,
        access_point_id: transaction.access_point_id,
        portal_session_id: transaction.portal_session_id,
        client_mac: portalSession.client_mac,
        ap_mac: portalSession.ap_mac,
        ssid_name: portalSession.ssid_name,
        status: 'ACTIVE',
        duration_seconds: transaction.duration_seconds,
        authorized_at: authorizedAt,
        expires_at: expiresAt,
        controller_name: controller?.name || null,
        ap_mac_resolved: ap?.ap_mac || null,
        ap_name: ap?.name || null,
        revoked_at: null,
        revoke_reason: null
      }, { onConflict: 'transaction_id' })
    if (authorizationError) throw authorizationError

    // Update transaction with provenance
    const { error: transactionError } = await supabaseAdmin
      .from('payment_transactions')
      .update({
        status: 'AUTHORIZED',
        voucher_code: voucher.code,
        omada_voucher_group_id: voucher.groupId,
        authorized_at: authorizedAt,
        expires_at: expiresAt,
        controller_name: controller?.name || null,
        ap_mac_resolved: ap?.ap_mac || null,
        ap_name: ap?.name || null,
        ap_model: ap?.model || null,
        omada_site_id_resolved: site?.omada_site_id || null,
        error_code: null,
        error_message: null
      })
      .eq('id', transaction.id)
    if (transactionError) throw transactionError

    const { error: sessionError } = await supabaseAdmin
      .from('portal_sessions')
      .update({ status: 'AUTHORIZED' })
      .eq('id', transaction.portal_session_id)
    if (sessionError) throw sessionError

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CLIENT_AUTHORIZED', transaction_id: transaction.id,
      site_id: transaction.site_id,
      details: { voucherCode: voucher.code, voucherGroupId: voucher.groupId, requestId }
    })

    console.log(JSON.stringify({
      level: 'info', event: 'CLIENT_AUTHORIZED', requestId,
      reference: transaction.reference, voucherCode: voucher.code, controllerId: transaction.controller_id
    }))

  } catch (err) {
    logError(err, 'Omada authorizeClient')

    await supabaseAdmin
      .from('payment_transactions')
      .update({
        status: 'AUTHORIZATION_FAILED',
        error_code: 'OMADA_ERROR',
        error_message: err instanceof Error ? err.message : 'Authorization failed'
      })
      .eq('id', transaction.id)

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CLIENT_AUTHORIZATION_FAILED', transaction_id: transaction.id,
      site_id: transaction.site_id,
      details: { clientMac: transaction.client_mac, error: err instanceof Error ? err.message : 'Unknown', requestId }
    })
  }
}
