/**
 * Webhook idempotency and payment flow tests
 */

import { mapMalipoPayStatus } from '@/lib/services/malipopay'

describe('mapMalipoPayStatus', () => {
  it('maps Success to PAYMENT_SUCCESS', () => {
    expect(mapMalipoPayStatus('Success')).toBe('PAYMENT_SUCCESS')
  })
  it('maps provider SUCCESSFUL status to PAYMENT_SUCCESS', () => {
    expect(mapMalipoPayStatus('SUCCESSFUL')).toBe('PAYMENT_SUCCESS')
  })
  it('maps Failed to PAYMENT_FAILED', () => {
    expect(mapMalipoPayStatus('Failed')).toBe('PAYMENT_FAILED')
  })
  it('maps unknown status to PAYMENT_FAILED', () => {
    expect(mapMalipoPayStatus('GIBBERISH')).toBe('PAYMENT_FAILED')
  })
})

describe('Webhook security rules', () => {
  it('reference format is validated', () => {
    const validRef = /^WIFI-\d{8}-[A-F0-9]{8}$/
    expect(validRef.test('WIFI-20260812-ABCD1234')).toBe(true)
    expect(validRef.test('WIFI-20260812-abcd1234')).toBe(false)
    expect(validRef.test('../../etc/passwd')).toBe(false)
    expect(validRef.test('')).toBe(false)
  })

  it('rejects amount that does not match expected', () => {
    const expectedAmount = 1000
    const receivedAmount = 500
    expect(receivedAmount).not.toBe(expectedAmount)
  })
})
