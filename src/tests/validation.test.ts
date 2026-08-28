import { omadaRedirectParamsSchema, createPaymentSchema, adminLoginSchema } from '@/lib/validation'

describe('omadaRedirectParamsSchema', () => {
  const valid = { clientMac: 'AA:BB:CC:DD:EE:FF', apMac: '12:22:33:44:55:66', ssidName: 'GuestWiFi' }

  it('accepts valid params', () => {
    const r = omadaRedirectParamsSchema.safeParse(valid)
    expect(r.success).toBe(true)
  })
  it('rejects invalid clientMac', () => {
    const r = omadaRedirectParamsSchema.safeParse({ ...valid, clientMac: 'not-a-mac' })
    expect(r.success).toBe(false)
  })
  it('rejects multicast and broadcast MAC addresses', () => {
    expect(omadaRedirectParamsSchema.safeParse({ ...valid, clientMac: '01:00:00:00:00:01' }).success).toBe(false)
    expect(omadaRedirectParamsSchema.safeParse({ ...valid, clientMac: 'FF:FF:FF:FF:FF:FF' }).success).toBe(false)
  })
  it('rejects empty ssidName', () => {
    const r = omadaRedirectParamsSchema.safeParse({ ...valid, ssidName: '' })
    expect(r.success).toBe(false)
  })
  it('uppercases MAC addresses', () => {
    const r = omadaRedirectParamsSchema.safeParse({ ...valid, clientMac: 'aa:bb:cc:dd:ee:ff' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.clientMac).toBe('AA:BB:CC:DD:EE:FF')
  })

  it('normalizes Omada MAC formats', () => {
    const r = omadaRedirectParamsSchema.safeParse({
      ...valid,
      clientMac: 'aa-bb-cc-dd-ee-ff',
      apMac: '12bb.ccdd.eeff'
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.clientMac).toBe('AA:BB:CC:DD:EE:FF')
      expect(r.data.apMac).toBe('12:BB:CC:DD:EE:FF')
    }
  })
})

describe('adminLoginSchema', () => {
  it('accepts valid credentials', () => {
    const r = adminLoginSchema.safeParse({ email: 'admin@test.com', password: 'password123' })
    expect(r.success).toBe(true)
  })
  it('rejects invalid email', () => {
    const r = adminLoginSchema.safeParse({ email: 'notanemail', password: 'password123' })
    expect(r.success).toBe(false)
  })
  it('rejects empty password', () => {
    const r = adminLoginSchema.safeParse({ email: 'admin@test.com', password: '' })
    expect(r.success).toBe(false)
  })
})
