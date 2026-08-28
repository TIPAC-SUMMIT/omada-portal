/**
 * MalipoPay Collection Service — Real Implementation
 *
 * API docs: https://developers.malipopay.co.tz
 *
 * Collection endpoint: POST /api/v1/payment/collection
 * Auth header:         apiToken: <token>
 *
 * Webhook payload:
 * {
 *   timestamp, reference, customerReference,
 *   amount, type, merchantAccountId, status,
 *   customer: { firstname, lastname, phoneNumber, mno },
 *   payloadSignature  ← deprecated; use X-Malipopay-Signature header
 * }
 *
 * Webhook statuses: "Success" | "Failed"
 * Signature:        X-Malipopay-Signature: sha256=<hex>  HMAC-SHA256(rawBody, secret)
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { ENV } from '../constants'
import { logError, devLog, normalizePhoneNumber } from '../utils'
import type { MalipoPayCollectionRequest } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IMalipoPayService {
  createCollection(request: MalipoPayCollectionRequest): Promise<{
    success: boolean
    malipoReference?: string   // MalipoPay's own ref e.g. "ML27154"
    transactionId?: string     // MalipoPay internal id
    reference: string          // our customerReference
    error?: string
  }>

  getPaymentStatus(reference: string): Promise<{
    success: boolean
    reference?: string
    customerReference?: string
    status?: string
    amount?: number
    paidAmount?: number
    error?: string
  }>

  verifyWebhook(rawBody: string, signatureHeader?: string): boolean

  parseWebhook(payload: any): {
    valid: boolean
    data?: {
      ourReference: string     // customerReference == our WIFI-... ref
      malipoReference: string  // reference field from MalipoPay
      status: string           // "Success" | "Failed"
      amount: number
      phoneNumber: string
      mno: string
      timestamp: string
    }
    error?: string
  }
}

// ── Real Implementation ────────────────────────────────────────────────────────

class RealMalipoPayService implements IMalipoPayService {
  private readonly baseUrl: string
  private readonly apiToken: string
  private readonly webhookSecret: string | undefined

  constructor() {
    this.baseUrl = ENV.MALIPOPAY_BASE_URL
    this.apiToken = ENV.MALIPOPAY_API_TOKEN
    this.webhookSecret = ENV.MALIPOPAY_WEBHOOK_SECRET

  }

  async createCollection(request: MalipoPayCollectionRequest): Promise<{
    success: boolean
    malipoReference?: string
    transactionId?: string
    reference: string
    error?: string
  }> {
    try {
      if (!this.apiToken) {
        throw new Error('MALIPOPAY_API_TOKEN environment variable is required')
      }

      const phoneNumber = normalizePhoneNumber(request.phoneNumber)

      // MalipoPay payload — we send our WIFI-... ref as the `reference` field.
      // MalipoPay echoes it back as `customerReference` in the webhook so we
      // can match it. Their own ref comes back as `reference` in the webhook.
      const payload = {
        reference: request.reference,          // our WIFI-YYYYMMDD-XXXXXXXX
        description: request.description,
        amount: request.amount,
        phoneNumber,
        amountType: request.amountType         // "FULL"
      }

      console.log(JSON.stringify({
        level: 'info',
        event: 'MALIPOPAY_COLLECTION_REQUEST',
        reference: payload.reference,
        amount: payload.amount,
        phoneNumber: phoneNumber.slice(0, -4) + '****'  // mask last 4 for logs
      }))

      const response = await fetch(`${this.baseUrl}/payment/collection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apiToken': this.apiToken
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000)   // 15 second timeout
      })

      const responseText = await response.text()

      if (!response.ok) {
        logError(`MalipoPay collection HTTP ${response.status}: ${responseText}`, 'createCollection')
        return {
          success: false,
          reference: request.reference,
          error: `Payment service error (${response.status}). Please try again.`
        }
      }

      let result: any
      try {
        result = JSON.parse(responseText)
      } catch {
        logError(`MalipoPay non-JSON response: ${responseText}`, 'createCollection')
        return { success: false, reference: request.reference, error: 'Invalid response from payment service' }
      }

      // API response:
      // { success: true, message: "Payment submitted successful!", data: { id, reference (ML...), status: "PROCESSING", ... } }
      if (!result.success) {
        logError(`MalipoPay collection failed: ${JSON.stringify(result)}`, 'createCollection')
        return {
          success: false,
          reference: request.reference,
          error: result.message || 'Payment initiation failed'
        }
      }

      console.log(JSON.stringify({
        level: 'info',
        event: 'MALIPOPAY_COLLECTION_ACCEPTED',
        ourReference: request.reference,
        malipoReference: result.data?.reference,
        transactionId: result.data?.id,
        status: result.data?.status
      }))

      return {
        success: true,
        malipoReference: result.data?.reference,   // "ML27154"
        transactionId: result.data?.id,
        reference: request.reference
      }

    } catch (error) {
      logError(error, 'MalipoPay createCollection')
      const msg = error instanceof Error && error.name === 'TimeoutError'
        ? 'Payment service timed out. Please try again.'
        : 'Payment service unavailable. Please try again.'
      return { success: false, reference: request.reference, error: msg }
    }
  }

  async getPaymentStatus(reference: string): Promise<{
    success: boolean
    reference?: string
    customerReference?: string
    status?: string
    amount?: number
    paidAmount?: number
    error?: string
  }> {
    try {
      if (!this.apiToken) throw new Error('MALIPOPAY_API_TOKEN environment variable is required')
      const response = await fetch(
        `${this.baseUrl}/payment/reference/${encodeURIComponent(reference)}`,
        { headers: { apiToken: this.apiToken }, signal: AbortSignal.timeout(10_000) }
      )
      const result = await response.json()
      if (!response.ok || !result.success || !result.data) {
        return { success: false, error: result.message || `Payment status error (${response.status})` }
      }

      const data = result.data
      return {
        success: true,
        reference: data.reference,
        customerReference: data.customerReference,
        status: typeof data.status === 'string' ? data.status.trim().toLowerCase() : undefined,
        amount: Number(data.amount),
        paidAmount: Number(data.paidAmount)
      }
    } catch (error) {
      logError(error, 'MalipoPay getPaymentStatus')
      return { success: false, error: 'Unable to verify payment status' }
    }
  }

  verifyWebhook(rawBody: string, signatureHeader?: string): boolean {
    // Never accept unsigned callbacks in production.
    if (!this.webhookSecret) {
      console.error(JSON.stringify({ level: 'error', event: 'WEBHOOK_NO_SECRET' }))
      return false
    }

    if (!signatureHeader) {
      console.warn(JSON.stringify({ level: 'warn', event: 'WEBHOOK_MISSING_SIGNATURE' }))
      return false
    }

    try {
      // Header format: "sha256=<hex>"
      const provided = signatureHeader.replace(/^sha256=/, '')
      const expected = createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex')

      const a = Buffer.from(provided.padEnd(64, '0'))
      const b = Buffer.from(expected)

      // Lengths must match before timingSafeEqual
      if (a.length !== b.length) return false

      return timingSafeEqual(a, b)
    } catch (error) {
      logError(error, 'MalipoPay verifyWebhook')
      return false
    }
  }

  parseWebhook(payload: any): {
    valid: boolean
    data?: {
      ourReference: string
      malipoReference: string
      status: string
      amount: number
      phoneNumber: string
      mno: string
      timestamp: string
    }
    error?: string
  } {
    try {
      // Required fields from docs. Accept numeric strings because webhook
      // providers commonly serialize amounts as JSON strings.
      if (typeof payload.reference !== 'string' || !payload.reference ||
          typeof payload.status !== 'string' || payload.amount === undefined) {
        return { valid: false, error: 'Missing required fields: reference, status, amount' }
      }

      const normalizedStatus = payload.status.trim().toLowerCase()
      const validStatuses = [
        'success', 'successful', 'paid', 'completed',
        'failed', 'cancelled', 'canceled'
      ]
      if (!validStatuses.includes(normalizedStatus)) {
        return { valid: false, error: `Unexpected status value: "${payload.status}"` }
      }

      const amount = typeof payload.amount === 'number'
        ? payload.amount
        : Number(payload.amount)
      if (!Number.isFinite(amount)) {
        return { valid: false, error: 'Invalid amount' }
      }

      // customerReference is our WIFI-... ref (what we sent as `reference` in request)
      // payload.reference is MalipoPay's own ML... ref
      // Fall back to payload.reference only if customerReference is missing
      const ourReference = payload.customerReference || payload.reference

      return {
        valid: true,
        data: {
          ourReference,
          malipoReference: payload.reference,
          status: normalizedStatus,
          amount,
          phoneNumber: payload.customer?.phoneNumber || '',
          mno: payload.customer?.mno || '',
          timestamp: payload.timestamp || ''
        }
      }
    } catch (error) {
      logError(error, 'MalipoPay parseWebhook')
      return { valid: false, error: 'Invalid webhook payload format' }
    }
  }
}

// ── Mock Implementation (MOCK_PAYMENTS=true) ────────────────────────────────

class MockMalipoPayService implements IMalipoPayService {
  private store = new Map<string, any>()

  async createCollection(request: MalipoPayCollectionRequest): Promise<any> {
    devLog('MockMalipoPay: createCollection', request.reference, request.amount)
    await delay(400)

    if (Math.random() < 0.05) {
      return { success: false, reference: request.reference, error: 'Mock failure (5% rate)' }
    }

    const malipoReference = 'ML' + Math.floor(Math.random() * 99999).toString().padStart(5, '0')
    const transactionId = '6' + Math.random().toString(36).substr(2, 23)

    this.store.set(request.reference, {
      malipoReference, transactionId,
      amount: request.amount, phoneNumber: request.phoneNumber
    })

    // Simulate MalipoPay calling our webhook after 4–8 seconds
    const ms = 4000 + Math.random() * 4000
    setTimeout(() => this.simulateWebhook(request.reference, malipoReference, request.amount, request.phoneNumber), ms)

    return { success: true, malipoReference, transactionId, reference: request.reference }
  }

  async getPaymentStatus(reference: string): Promise<any> {
    const payment = this.store.get(reference)
    if (!payment) return { success: false, error: 'Payment not found' }
    return {
      success: true,
      reference: payment.malipoReference,
      customerReference: reference,
      status: payment.status?.toLowerCase() || 'processing',
      amount: payment.amount,
      paidAmount: payment.status === 'Success' ? payment.amount : 0
    }
  }

  verifyWebhook(): boolean { return true }

  parseWebhook(payload: any) {
    if (!payload.reference || !payload.status) {
      return { valid: false, error: 'Missing fields' }
    }
    return {
      valid: true,
      data: {
        ourReference: payload.customerReference || payload.reference,
        malipoReference: payload.reference,
        status: payload.status,
        amount: payload.amount,
        phoneNumber: payload.customer?.phoneNumber || '',
        mno: payload.customer?.mno || 'Airtel',
        timestamp: payload.timestamp || new Date().toISOString()
      }
    }
  }

  private simulateWebhook(ourRef: string, malipoRef: string, amount: number, phone: string) {
    const success = Math.random() > 0.1
    const webhookPayload = {
      timestamp: new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14),
      reference: malipoRef,
      customerReference: ourRef,
      amount,
      type: 'CHARGE',
      merchantAccountId: 'TIPAC SUMMIT',
      status: success ? 'Success' : 'Failed',
      customer: { firstname: 'TEST', lastname: 'USER', phoneNumber: phone, mno: 'Airtel' },
      payloadSignature: 'mock-sig'
    }

    devLog('MockMalipoPay: delivering webhook', webhookPayload)

    fetch(`${ENV.APP_URL}/api/malipopay/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    }).catch(e => devLog('Mock webhook error:', e))
  }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ── Factory ────────────────────────────────────────────────────────────────────

let _instance: IMalipoPayService | null = null

export function createMalipoPayService(): IMalipoPayService {
  if (!_instance) {
    _instance = ENV.MOCK_PAYMENTS ? new MockMalipoPayService() : new RealMalipoPayService()
  }
  return _instance
}

export const malipoPayService = createMalipoPayService()

// ── Status mapping ─────────────────────────────────────────────────────────────

/** Map MalipoPay webhook status to our internal TransactionStatus */
export function mapMalipoPayStatus(status: string): string {
  switch (status.trim().toLowerCase()) {
    case 'success':
    case 'successful':
    case 'paid':
    case 'completed': return 'PAYMENT_SUCCESS'
    case 'failed':
    case 'cancelled':
    case 'canceled': return 'PAYMENT_FAILED'
    default:        return 'PAYMENT_FAILED'
  }
}

/** Detect mobile money provider from TZ phone number */
export function detectMobileMoneyProvider(phoneNumber: string): string {
  const n = phoneNumber.replace(/\D/g, '')
  if (/^255(74|75|76)/.test(n)) return 'M-PESA (Vodacom)'
  if (/^255(71|65|67)/.test(n)) return 'Tigo Pesa'
  if (/^255(68|69|78|79)/.test(n)) return 'Airtel Money'
  if (/^25562/.test(n))            return 'Halopesa'
  return 'Mobile Money'
}
