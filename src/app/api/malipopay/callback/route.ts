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
import { omadaService } from '@/lib/services/omada'
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
    // Return 200 so MalipoPay doesn't retry a legitimately rejected delivery
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
    // Return 200 — we don't want retries for references we don't recognise
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

  // ── 6. Transaction must still be in a pending state ────────────────────────
  const processable = ['PENDING', 'PAYMENT_INITIATED']
  if (!processable.includes(transaction.status)) {
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

    // Atomically mark processed with failure to prevent future processing
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

  // ── 8. Map status and atomically claim the webhook ─────────────────────────
  const mappedStatus = mapMalipoPayStatus(malipoStatus)

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('payment_transactions')
    .update({
      webhook_processed_at: now(),
      webhook_payload: payload,
      malipopay_transaction_id: malipoReference,
      status: mappedStatus
    })
    .eq('id', transaction.id)
    .is('webhook_processed_at', null)    // only claim if not yet processed
    .select('*')
    .single()

  if (claimError || !claimed) {
    // Race condition — another instance already claimed it
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

  // ── Assign voucher to this transaction ─────────────────────────────────────
  let voucherCode: string | null = null
  try {
    const vRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/vouchers/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction_id: transaction.id,
        site_id: transaction.site_id,
        price_tzs: transaction.amount_tzs
      })
    })
    const vData = await vRes.json()
    if (vData.success) {
      voucherCode = vData.data.code
      // Store voucher code in transaction for status polling
      await supabaseAdmin.from('payment_transactions')
        .update({ error_code: null, error_message: voucherCode ? `VOUCHER:${voucherCode}` : null })
        .eq('id', transaction.id)
    } else {
      console.warn(JSON.stringify({ level: 'warn', event: 'VOUCHER_ASSIGN_FAILED', error: vData.error, reference: transaction.reference }))
    }
  } catch (vErr) {
    console.warn(JSON.stringify({ level: 'warn', event: 'VOUCHER_ASSIGN_ERROR', error: String(vErr) }))
  }

    await handlePaymentSuccess(transaction, malipoReference, requestId)
  } else {
    // Payment failed/cancelled — reset session to PACKAGE_SELECTED so guest can retry
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
// After confirmed payment → authorize client in Omada
// ─────────────────────────────────────────────────────────────────────────────
async function handlePaymentSuccess(transaction: any, malipoReference: string, requestId: string) {
  // Mark as authorizing
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
    // Find active controller for this site — fallback to ENV config
    const { data: controllers } = await supabaseAdmin
      .from('omada_controllers')
      .select('*')
      .eq('site_id', transaction.site_id)
      .eq('is_active', true)
      .limit(1)

    // Use DB controller or build one from environment variables
    const controller = controllers?.[0] ?? {
      id: 'env-default',
      site_id: transaction.site_id,
      name: 'Default Controller',
      controller_url: process.env.OMADA_CONTROLLER_URL || 'https://euw1-api-omada-controller-connector.tplinkcloud.com',
      omadac_id: process.env.OMADA_OMADAC_ID || '5b0175a0ecd5b6c5f6926577f0856289',
      username: process.env.OMADA_USERNAME || 'api_tipac',
      password_secret_ref: 'OMADA_PASSWORD',
      api_version: 'v2',
      is_active: true,
      use_site_connector: false,
      site_connector_url: null,
      last_seen_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    if (!controller) {
      throw new Error('No Omada controller configured')
    }

    const authResult = await omadaService.authorizeClient(controller, {
      clientMac: transaction.client_mac,
      duration: transaction.duration_seconds,
      apMac: transaction.ap_mac,
      ssidName: transaction.ssid_name,
      radioId: transaction.radio_id || '0',
      clientIp: transaction.client_ip || undefined,
      site: transaction.site_omada_id || transaction.ssid_name  // v6.2.10 site ID
    } as any)

    if (!authResult.success) {
      throw new Error(authResult.error || 'Omada authorization rejected')
    }

    const authorizedAt = now()
    const expiresAt = new Date(Date.now() + transaction.duration_seconds * 1000).toISOString()

    // Persist authorization record
    await supabaseAdmin.from('client_authorizations').insert({
      transaction_id: transaction.id,
      site_id: transaction.site_id,
      portal_session_id: transaction.portal_session_id,
      client_mac: transaction.client_mac,
      ap_mac: transaction.ap_mac,
      ssid_name: transaction.ssid_name,
      status: 'ACTIVE',
      duration_seconds: transaction.duration_seconds,
      authorized_at: authorizedAt,
      expires_at: expiresAt,
      omada_response: authResult
    })

    // Mark transaction AUTHORIZED
    await supabaseAdmin
      .from('payment_transactions')
      .update({ status: 'AUTHORIZED', authorized_at: authorizedAt, expires_at: expiresAt })
      .eq('id', transaction.id)

    // Mark portal session AUTHORIZED
    await supabaseAdmin
      .from('portal_sessions')
      .update({ status: 'AUTHORIZED' })
      .eq('id', transaction.portal_session_id)

    await supabaseAdmin.from('audit_logs').insert({
      action: 'CLIENT_AUTHORIZED', transaction_id: transaction.id,
      site_id: transaction.site_id,
      details: { clientMac: transaction.client_mac, expiresAt, requestId }
    })

    console.log(JSON.stringify({
      level: 'info', event: 'CLIENT_AUTHORIZED', requestId,
      reference: transaction.reference, clientMac: transaction.client_mac, expiresAt
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
