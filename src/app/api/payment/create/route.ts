/**
 * Payment Creation API
 * POST /api/payment/create
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { malipoPayService } from '@/lib/services/malipopay'
import {
  hashSessionToken,
  generateTransactionReference,
  normalizePhoneNumber,
  validateTanzanianPhone,
  apiSuccess,
  apiError,
  logError,
  now,
  addMinutes
} from '@/lib/utils'
import { HTTP_STATUS, PAYMENT_TIMEOUT_MINUTES } from '@/lib/constants'
import { buildPaymentDescription } from '@/lib/payment-description'

async function getPortalSession(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.substring(7)
  const tokenHash = hashSessionToken(token)

  const { data: session } = await supabaseAdmin
    .from('portal_sessions')
    .select('*')
    .eq('session_token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .single()

  return session ?? null
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const session = await getPortalSession(authHeader)

    if (!session) {
      return Response.json(apiError('Invalid or expired session', 'INVALID_SESSION'), {
        status: HTTP_STATUS.UNAUTHORIZED
      })
    }

    if (!session.selected_package_id) {
      return Response.json(apiError('No package selected. Please select a package first.', 'PACKAGE_NOT_SELECTED'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Fetch package price from DB — never trust client-submitted price
    const { data: selectedPackage, error: pkgError } = await supabaseAdmin
      .from('packages')
      .select('*')
      .eq('id', session.selected_package_id)
      .eq('status', 'ACTIVE')
      .single()

    if (pkgError || !selectedPackage) {
      return Response.json(apiError('Selected package is no longer available', 'PACKAGE_NOT_AVAILABLE'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Validate phone number from body
    const body = await request.json()
    const rawPhone = body.phoneNumber

    if (!rawPhone || typeof rawPhone !== 'string') {
      return Response.json(apiError('phoneNumber is required', 'VALIDATION_ERROR'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    let normalizedPhone: string
    try {
      normalizedPhone = normalizePhoneNumber(rawPhone)
    } catch {
      return Response.json(apiError('Invalid phone number format', 'INVALID_PHONE_NUMBER'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (!validateTanzanianPhone(normalizedPhone)) {
      return Response.json(apiError('Please enter a valid Tanzanian mobile number (e.g. 0687 123 456)', 'INVALID_PHONE_NUMBER'), {
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Check for existing ACTIVE payment for this session
    // Allow retry if previous attempt failed/cancelled/timed out/expired
    const { data: existingTransaction } = await supabaseAdmin
      .from('payment_transactions')
      .select('reference, status, expires_at, created_at')
      .eq('portal_session_id', session.id)
      .in('status', ['PENDING', 'PAYMENT_INITIATED', 'PAYMENT_SUCCESS', 'OMADA_AUTHORIZING', 'AUTHORIZED'])
      .maybeSingle()

    if (existingTransaction) {
      // Already authorized — no need to pay again
      if (existingTransaction.status === 'AUTHORIZED') {
        return Response.json(apiError('Internet access is already active for this session', 'ALREADY_AUTHORIZED'), {
          status: HTTP_STATUS.CONFLICT
        })
      }

      // Payment in progress but not yet expired — block duplicate
      const isExpired = existingTransaction.expires_at
        ? new Date(existingTransaction.expires_at) < new Date()
        : false

      // Also treat as expired if older than 20 minutes with no webhook yet
      const createdAt = new Date(existingTransaction.created_at)
      const ageMinutes = (Date.now() - createdAt.getTime()) / 60000
      const isStale = ageMinutes > 20

      if (!isExpired && !isStale) {
        return Response.json(apiError('A payment is already in progress. Please wait or try again in a few minutes.', 'PAYMENT_ALREADY_INITIATED'), {
          status: HTTP_STATUS.CONFLICT
        })
      }

      // Previous payment expired/stale — mark it expired so a new one can proceed
      await supabaseAdmin
        .from('payment_transactions')
        .update({ status: 'EXPIRED' })
        .eq('reference', existingTransaction.reference)
    }

    // Generate unique reference and create transaction record BEFORE calling MalipoPay
    const reference = generateTransactionReference()
    const expiresAt = addMinutes(PAYMENT_TIMEOUT_MINUTES)

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from('payment_transactions')
      .insert({
        reference,
        site_id: session.site_id,
        package_id: session.selected_package_id,
        portal_session_id: session.id,
        client_mac: session.client_mac,
        ap_mac: session.ap_mac,
        ssid_name: session.ssid_name,
        phone_number: normalizedPhone,
        amount_tzs: selectedPackage.price_tzs,       // price from DB, not client
        status: 'PENDING',
        duration_seconds: selectedPackage.duration_seconds,
        expires_at: expiresAt
      })
      .select('*')
      .single()

    if (transactionError) {
      throw new Error(`Failed to create transaction: ${transactionError.message}`)
    }

    // Mark portal session as payment initiated
    await supabaseAdmin
      .from('portal_sessions')
      .update({ status: 'PAYMENT_INITIATED' })
      .eq('id', session.id)

    // Call MalipoPay STK Push
    try {
      // Build a friendly, package-specific payment description
      const description = buildPaymentDescription(selectedPackage.name, selectedPackage.price_tzs, selectedPackage.duration_seconds)

      const collectionResult = await malipoPayService.createCollection({
        reference,
        description,
        amount: selectedPackage.price_tzs,
        phoneNumber: normalizedPhone,
        amountType: 'FULL'
      })

      if (!collectionResult.success) {
        await supabaseAdmin
          .from('payment_transactions')
          .update({ status: 'PAYMENT_FAILED', error_message: collectionResult.error })
          .eq('id', transaction.id)

        return Response.json(apiError(collectionResult.error || 'Failed to initiate payment. Please try again.', 'MALIPOPAY_ERROR'), {
          status: HTTP_STATUS.SERVICE_UNAVAILABLE
        })
      }

      // Update with MalipoPay reference and mark as initiated
      await supabaseAdmin
        .from('payment_transactions')
        .update({
          status: 'PAYMENT_INITIATED',
          malipopay_transaction_id: collectionResult.malipoReference || collectionResult.transactionId
        })
        .eq('id', transaction.id)

      return Response.json(apiSuccess({
        reference,
        amount: selectedPackage.price_tzs,
        phoneNumber: normalizedPhone,
        packageName: selectedPackage.name,
        durationSeconds: selectedPackage.duration_seconds,
        description,
        status: 'initiated'
      }), { status: HTTP_STATUS.CREATED })

    } catch (malipoError) {
      logError(malipoError, 'MalipoPay STK Push')

      await supabaseAdmin
        .from('payment_transactions')
        .update({
          status: 'PAYMENT_FAILED',
          error_message: malipoError instanceof Error ? malipoError.message : 'Payment service error'
        })
        .eq('id', transaction.id)

      return Response.json(apiError('Payment service temporarily unavailable. Please try again.', 'MALIPOPAY_ERROR'), {
        status: HTTP_STATUS.SERVICE_UNAVAILABLE
      })
    }

  } catch (error) {
    logError(error, 'Payment creation')
    return Response.json(apiError('Failed to initiate payment'), {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR
    })
  }
}

// ── Payment description builder ───────────────────────────────────────────────
