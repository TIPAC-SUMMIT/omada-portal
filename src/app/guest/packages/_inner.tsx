'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Clock, CreditCard, Phone, Ticket, AlertCircle, Wifi, Shield, Zap, ArrowRight, Loader2 } from 'lucide-react'
import { formatDurationSwahili } from '@/lib/constants'
import { normalizePhoneNumber, validateTanzanianPhone } from '@/lib/utils'
import type { Package } from '@/lib/types'

const PROVIDER_ICONS: Record<string, string> = {
  Vodacom: '🔴', Airtel: '🔴', Tigo: '🔵', Halotel: '🟠'
}

const MOBILE_MONEY_NETWORKS = [
  { name: 'M-Pesa', color: 'bg-red-600', text: 'M-Pesa' },
  { name: 'Tigo Pesa', color: 'bg-blue-600', text: 'Tigo Pesa' },
  { name: 'Airtel Money', color: 'bg-red-500', text: 'Airtel Money' },
  { name: 'HaloPesa', color: 'bg-orange-500', text: 'HaloPesa' },
]

const PROVIDER_LABELS: Record<string, string> = {
  Vodacom: 'M-Pesa',
  Airtel: 'Airtel Money',
  Tigo: 'Tigo Pesa',
  Halotel: 'HaloPesa',
}

const PROVIDER_COLORS: Record<string, string> = {
  Vodacom: 'text-red-600',
  Airtel: 'text-red-500',
  Tigo: 'text-blue-600',
  Halotel: 'text-orange-500',
}

function detectProvider(phone: string): string {
  const n = phone.replace(/\D/g, '').replace(/^0/, '255')
  if (/^255(74|75|76)/.test(n)) return 'Vodacom'
  if (/^255(68|69|78|79)/.test(n)) return 'Airtel'
  if (/^255(71|65|67)/.test(n)) return 'Tigo'
  if (/^25562/.test(n)) return 'Halotel'
  return ''
}

export default function PackagesInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionToken = searchParams.get('token')

  const [packages, setPackages] = useState<Package[]>([])
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)
  const [phone, setPhone] = useState('')
  const [voucher, setVoucher] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [provider, setProvider] = useState('')
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<'select' | 'pay'>('select')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sessionToken) {
      // Wait a tick in case searchParams hasn't hydrated yet
      const timer = setTimeout(() => {
        if (!sessionToken) window.location.href = '/guest/login'
      }, 500)
      return () => clearTimeout(timer)
    }
    fetch('/api/portal/packages', { headers: { Authorization: `Bearer ${sessionToken}` } })
      .then(r => r.json())
      .then(d => { setPackages(d.data || []); setLoading(false) })
      .catch(() => { setError('Imeshindikana kupakia vifurushi.'); setLoading(false) })
  }, [sessionToken])

  const handleSelect = async (pkg: Package) => {
    setError('')
    try {
      const res = await fetch('/api/portal/packages/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ packageId: pkg.id })
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Imeshindikana kuchagua kifurushi. Jaribu tena.')
        return
      }
      setSelectedPkg(pkg)
      setStep('pay')
    } catch (e) {
      setError('Tatizo la kuunganisha. Jaribu tena.')
    }
  }

  const handlePhoneChange = (val: string) => {
    setPhone(val); setPhoneError(''); setProvider('')
    if (val.length >= 9) {
      try {
        const norm = normalizePhoneNumber(val)
        if (!validateTanzanianPhone(norm)) { setPhoneError('Weka namba sahihi ya simu ya Tanzania') }
        else setProvider(detectProvider(norm))
      } catch { setPhoneError('Muundo wa namba si sahihi') }
    }
  }

  const handlePay = async () => {
    if (!phone) { setPhoneError('Namba ya simu inahitajika'); return }
    try {
      const norm = normalizePhoneNumber(phone)
      if (!validateTanzanianPhone(norm)) { setPhoneError('Weka namba sahihi ya simu ya Tanzania'); return }
    } catch { setPhoneError('Muundo wa namba si sahihi'); return }

    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ phoneNumber: phone })
      })
      const data = await res.json()
      if (!data.success) { setError(data.error || 'Malipo yameshindikana.'); setSubmitting(false); return }
      window.location.href = `/guest/payment?reference=${data.data.reference}&phone=${encodeURIComponent(phone)}&token=${encodeURIComponent(sessionToken || '')}&pkg=${encodeURIComponent(data.data.packageName || '')}&amount=${data.data.amount || ''}`
    } catch { setError('Tatizo la kuunganisha. Jaribu tena.'); setSubmitting(false) }
  }

  const handleVoucher = () => {
    if (!voucher.trim()) {
      setError('Weka namba ya vocha kwanza.')
      return
    }
    if (!searchParams.get('tp')) {
      setError('Anwani ya kuingia Wi-Fi haipo. Zima kisha washa Wi-Fi ujaribu tena.')
      return
    }
    const params = new URLSearchParams()
    for (const key of ['clientMac', 'apMac', 'ssidName', 'site', 't', 'gatewayMac', 'radioId', 'vid', 'redirectUrl', 'tp']) {
      const value = searchParams.get(key)
      if (value) params.set(key, value)
    }
    params.set('voucher', voucher.trim().toUpperCase())
    window.location.href = `/portal?${params.toString()}`
  }

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 animate-spin text-brand-300 mx-auto mb-4" />
        <p className="text-brand-200">Inapakia vifurushi…</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-gray-900">
      {/* Header */}
      <div className="px-4 pt-8 pb-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur rounded-2xl mb-4">
          <Wifi className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">TIPAC SUMMIT</h1>
        <p className="text-brand-200 text-sm mt-1">Internet ya Wi-Fi yenye kasi</p>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="flex items-center gap-1.5 text-brand-300 text-xs">
            <Shield className="w-3.5 h-3.5" /> Malipo salama
          </div>
          <div className="flex items-center gap-1.5 text-brand-300 text-xs">
            <Zap className="w-3.5 h-3.5" /> Internet mara moja
          </div>
        </div>
      </div>

      <div className="px-4 pb-8 max-w-md mx-auto">
        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-400/30 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        {step === 'select' && (
          <>
            <p className="text-brand-200 text-sm text-center mb-4">Chagua kifurushi chako cha internet</p>
            <div className="space-y-3">
              {packages.map((pkg, i) => {
                const popular = i === 1
                return (
                  <button key={pkg.id} onClick={() => handleSelect(pkg)}
                    className={`w-full text-left rounded-2xl p-4 transition-all active:scale-95 relative overflow-hidden
                      ${popular
                        ? 'bg-brand-500 border-2 border-brand-300 shadow-lg shadow-brand-900/50'
                        : 'bg-white/10 border border-white/20 hover:bg-white/15'}`}>
                    {popular && (
                      <span className="absolute top-2 right-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">
                        INAPENDWA
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-bold text-lg ${popular ? 'text-white' : 'text-white'}`}>{pkg.name}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Clock className={`w-3.5 h-3.5 ${popular ? 'text-brand-100' : 'text-brand-300'}`} />
                          <span className={`text-sm ${popular ? 'text-brand-100' : 'text-brand-300'}`}>
                            {formatDurationSwahili(pkg.duration_seconds)} za kutumia internet
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${popular ? 'text-white' : 'text-white'}`}>
                          TZS {pkg.price_tzs.toLocaleString()}
                        </p>
                        <ArrowRight className={`w-4 h-4 ml-auto mt-1 ${popular ? 'text-brand-100' : 'text-brand-400'}`} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Supported networks */}
            <div className="mt-6 bg-white/5 rounded-xl p-4">
              <p className="text-brand-300 text-xs text-center mb-3">Mitandao ya pesa inayokubalika</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {MOBILE_MONEY_NETWORKS.map(network => (
                  <div key={network.name} className={`${network.color} rounded-lg py-2.5 px-1 text-center shadow-sm`}>
                    <p className="text-white text-xs font-bold">{network.text}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-yellow-300/30 bg-yellow-400/10 p-4">
              <p className="text-white text-sm font-semibold text-center">Ulinunua vocha kwa cash?</p>
              <p className="text-brand-200 text-xs mt-1 text-center">Weka namba ya vocha uliyopewa dukani.</p>
              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <Ticket className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    value={voucher}
                    onChange={e => { setVoucher(e.target.value.toUpperCase()); setError('') }}
                    placeholder="Namba ya vocha"
                    className="w-full rounded-lg border-0 py-2.5 pl-9 pr-3 font-mono text-sm text-gray-900 uppercase"
                    autoComplete="off"
                  />
                </div>
                <button onClick={handleVoucher}
                  className="rounded-lg bg-yellow-400 px-3 py-2 text-sm font-bold text-yellow-950 hover:bg-yellow-300">
                  Tumia
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'pay' && selectedPkg && (
          <>
            {/* Selected package summary */}
            <div className="bg-white/10 border border-white/20 rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-brand-300 text-xs uppercase tracking-wide mb-1">Kifurushi ulichochagua</p>
                  <p className="text-white font-bold text-lg">{selectedPkg.name}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-3.5 h-3.5 text-brand-300" />
                    <span className="text-brand-200 text-sm">{formatDurationSwahili(selectedPkg.duration_seconds)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold text-2xl">TZS {selectedPkg.price_tzs.toLocaleString()}</p>
                  <button onClick={() => { setStep('select'); setSelectedPkg(null) }}
                    className="text-brand-300 text-xs mt-1 hover:text-white">Badilisha</button>
                </div>
              </div>
            </div>

            {/* Phone input */}
            <div className="bg-white rounded-2xl p-5 shadow-xl">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Weka namba yako ya pesa ya simu
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => handlePhoneChange(e.target.value)}
                  placeholder="0687 123 456"
                  className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl text-gray-900 text-lg
                    focus:outline-none transition-colors
                    ${phoneError ? 'border-red-400 focus:border-red-400' : 'border-gray-200 focus:border-brand-500'}`}
                  disabled={submitting}
                />
                {provider && !phoneError && (
                  <span className={`absolute right-3 top-3 text-sm font-medium ${PROVIDER_COLORS[provider]}`}>
                    {PROVIDER_ICONS[provider]} {PROVIDER_LABELS[provider] || provider}
                  </span>
                )}
              </div>
              {phoneError && <p className="text-red-500 text-sm mt-1.5">{phoneError}</p>}
              <p className="text-gray-400 text-xs mt-2">Mfano: 0687 123 456 au 255687123456</p>

              <button
                onClick={handlePay}
                disabled={submitting || !!phoneError || phone.length < 9}
                className="w-full mt-4 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300
                  text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-lg">
                {submitting
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Inashughulikia…</>
                  : <><CreditCard className="w-5 h-5" /> Lipa TZS {selectedPkg.price_tzs.toLocaleString()}</>}
              </button>

              <div className="flex items-center justify-center gap-2 mt-3">
                <Shield className="w-3.5 h-3.5 text-gray-400" />
                <p className="text-gray-400 text-xs">Malipo salama kupitia MalipoPay · TIPAC SUMMIT</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
