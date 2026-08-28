export function buildPaymentDescription(packageName: string, priceTzs: number, durationSeconds: number): string {
  const duration = formatDurationSwahili(durationSeconds)
  return `Kamilisha malipo ya TZS ${priceTzs.toLocaleString('en-TZ')} kupata kifurushi cha intaneti cha ${duration} (${packageName}).`
}

export function formatDurationSwahili(seconds: number): string {
  if (seconds >= 86400 && seconds % 86400 === 0) {
    return `siku ${seconds / 86400}`
  }
  if (seconds >= 3600 && seconds % 3600 === 0) {
    return `saa ${seconds / 3600}`
  }
  return `dakika ${Math.round(seconds / 60)}`
}
