import { calculateOmadaExpiryMillis } from '@/lib/services/omada-open-api'

describe('Omada authorization duration', () => {
  it('converts package seconds to an epoch expiry in milliseconds', () => {
    expect(calculateOmadaExpiryMillis(1_700_000_000_000, 7 * 60)).toBe(1_700_000_420_000)
    expect(calculateOmadaExpiryMillis(1_700_000_000_000, 6 * 60 * 60)).toBe(1_700_021_600_000)
    expect(calculateOmadaExpiryMillis(1_700_000_000_000, 24 * 60 * 60)).toBe(1_700_086_400_000)
  })
})
