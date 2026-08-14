import {
  validateTanzanianPhone,
  normalizePhoneNumber,
  validateMacAddress,
  normalizeMacAddress,
  generateTransactionReference,
  hashSessionToken,
  isPast,
  isFuture,
  addSeconds,
  maskPhoneNumber,
} from '@/lib/utils'

describe('validateTanzanianPhone', () => {
  it('accepts valid Vodacom number', () => {
    expect(validateTanzanianPhone('255744000000')).toBe(true)
  })
  it('accepts valid Airtel number', () => {
    expect(validateTanzanianPhone('255680000000')).toBe(true)
  })
  it('rejects numbers too short', () => {
    expect(validateTanzanianPhone('25574400000')).toBe(false)
  })
  it('rejects non-TZ prefix', () => {
    expect(validateTanzanianPhone('254700000000')).toBe(false)
  })
  it('rejects empty string', () => {
    expect(validateTanzanianPhone('')).toBe(false)
  })
})

describe('normalizePhoneNumber', () => {
  it('leaves 255 prefix as-is', () => {
    expect(normalizePhoneNumber('255744123456')).toBe('255744123456')
  })
  it('converts 0-prefixed number', () => {
    expect(normalizePhoneNumber('0744123456')).toBe('255744123456')
  })
  it('converts 9-digit number', () => {
    expect(normalizePhoneNumber('744123456')).toBe('255744123456')
  })
  it('strips spaces and dashes', () => {
    expect(normalizePhoneNumber('0744 123 456')).toBe('255744123456')
  })
})

describe('validateMacAddress', () => {
  it('accepts valid MAC', () => {
    expect(validateMacAddress('AA:BB:CC:DD:EE:FF')).toBe(true)
  })
  it('accepts lowercase MAC', () => {
    expect(validateMacAddress('aa:bb:cc:dd:ee:ff')).toBe(true)
  })
  it('rejects invalid MAC', () => {
    expect(validateMacAddress('AA:BB:CC:DD:EE')).toBe(false)
  })
  it('rejects no separators', () => {
    expect(validateMacAddress('AABBCCDDEEFF')).toBe(false)
  })
})

describe('normalizeMacAddress', () => {
  it('uppercases and adds colons', () => {
    expect(normalizeMacAddress('aabbccddeeff')).toBe('AA:BB:CC:DD:EE:FF')
  })
  it('handles dashes', () => {
    expect(normalizeMacAddress('AA-BB-CC-DD-EE-FF')).toBe('AA:BB:CC:DD:EE:FF')
  })
  it('throws for invalid length', () => {
    expect(() => normalizeMacAddress('AABBCC')).toThrow()
  })
})

describe('generateTransactionReference', () => {
  it('starts with WIFI prefix', () => {
    const ref = generateTransactionReference()
    expect(ref).toMatch(/^WIFI-\d{8}-[A-F0-9]{8}$/)
  })
  it('generates unique references', () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateTransactionReference()))
    expect(refs.size).toBe(100)
  })
})

describe('hashSessionToken', () => {
  it('produces consistent hash', () => {
    expect(hashSessionToken('test')).toBe(hashSessionToken('test'))
  })
  it('produces different hashes for different inputs', () => {
    expect(hashSessionToken('a')).not.toBe(hashSessionToken('b'))
  })
  it('returns 64-char hex string', () => {
    expect(hashSessionToken('test')).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('time utilities', () => {
  it('isPast returns true for past dates', () => {
    expect(isPast('2000-01-01T00:00:00Z')).toBe(true)
  })
  it('isFuture returns true for future dates', () => {
    expect(isFuture('2099-01-01T00:00:00Z')).toBe(true)
  })
  it('addSeconds returns future timestamp', () => {
    const future = addSeconds(3600)
    expect(isFuture(future)).toBe(true)
  })
})

describe('maskPhoneNumber', () => {
  it('shows last 4 digits only', () => {
    const masked = maskPhoneNumber('255744123456')
    expect(masked).toMatch(/3456$/)
    expect(masked).not.toContain('744')
  })
})
