import { buildPaymentDescription, formatDurationSwahili } from '@/lib/payment-description'

describe('Kiswahili payment description', () => {
  it('includes the exact price and duration for short packages', () => {
    expect(buildPaymentDescription('Dakika 7', 1000, 7 * 60))
      .toBe('Kamilisha malipo ya TZS 1,000 kupata kifurushi cha intaneti cha dakika 7 (Dakika 7).')
  })

  it('formats longer package durations in Kiswahili', () => {
    expect(formatDurationSwahili(6 * 60 * 60)).toBe('saa 6')
    expect(formatDurationSwahili(24 * 60 * 60)).toBe('siku 1')
  })
})
