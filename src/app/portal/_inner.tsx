'use client'
/**
 * TIPAC SUMMIT — Omada Captive Portal Page
 * This replaces the default TP-Link portal page.
 * Supports: Voucher login, Username/Password login
 * Also shows "Buy Voucher" button that redirects to payment page.
 */
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Wifi, Eye, EyeOff, Loader2, Ticket, ShoppingCart, User, Lock } from 'lucide-react'

export default function PortalPage() {
  const searchParams = useSearchParams()

  // Omada passes these in the URL
  const clientMac  = searchParams.get('clientMac')  || ''
  const apMac      = searchParams.get('apMac')      || ''
  const ssidName   = searchParams.get('ssidName')   || ''
  const site        = searchParams.get('site')      || ''
  const t           = searchParams.get('t')          || ''
  const gatewayMac  = searchParams.get('gatewayMac') || ''
  const radioId    = searchParams.get('radioId')    || ''
  const vid        = searchParams.get('vid')        || ''
  const redirectUrl = searchParams.get('redirectUrl') || ''
  const originUrl  = searchParams.get('originUrl') || redirectUrl
  const tp         = searchParams.get('tp') || ''
  const sessionToken = searchParams.get('token') || ''

  const [tab, setTab] = useState<'voucher' | 'user'>('voucher')
  const [voucher, setVoucher] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill voucher if redirected back from payment page with ?voucher=CODE
  useEffect(() => {
    const preVoucher = searchParams.get('voucher') ?? searchParams.get('voucherCode') ?? ''
    if (preVoucher) setVoucher(preVoucher.trim())
  }, [searchParams])

  // URLSearchParams has already decoded the tp value supplied by Omada.
  const omadaSubmitUrl = tp

  const handleVoucherLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!voucher.trim()) { setError('Weka namba ya vocha yako'); return }
    setLoading(true); setError('')

    if (!omadaSubmitUrl) {
      if (!sessionToken) {
        setError('Kikao cha Wi-Fi kimeisha. Zima kisha washa Wi-Fi ujaribu tena.')
        setLoading(false)
        return
      }
      try {
        const response = await fetch('/api/portal/voucher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken, voucherCode: voucher.trim() }),
        })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Vocha imekataliwa na Omada.')
        }
        window.location.href = result.data?.redirectUrl || '/'
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Imeshindikana kuunganisha vocha.')
        setLoading(false)
      }
      return
    }

    // Submit to Omada controller directly (standard portal submit)
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = omadaSubmitUrl

    const voucherValue = voucher.trim()
    const fields: Record<string, string> = {
      voucherCode: voucherValue,
      voucher: voucherValue,
      clientMac, apMac, ssidName, gatewayMac, radioId, vid,
      originUrl,
      authType: '3', // Omada voucher authentication
    }
    Object.entries(fields).forEach(([k, v]) => {
      if (!v) return
      const input = document.createElement('input')
      input.type = 'hidden'; input.name = k; input.value = v
      form.appendChild(input)
    })
    document.body.appendChild(form)
    form.submit()
  }

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) { setError('Weka jina la mtumiaji na neno la siri'); return }
    setLoading(true); setError('')

    if (!omadaSubmitUrl) {
      setError('Kuingia kwa jina la mtumiaji kunahitaji anwani ya Omada portal.')
      setLoading(false)
      return
    }

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = omadaSubmitUrl

    const fields: Record<string, string> = {
      localuser: username.trim(),
      localuserPsw: password,
      clientMac, apMac, ssidName, gatewayMac, radioId, vid,
      originUrl,
      authType: '5', // Omada local-user authentication
    }
    Object.entries(fields).forEach(([k, v]) => {
      if (!v) return
      const input = document.createElement('input')
      input.type = 'hidden'; input.name = k; input.value = v
      form.appendChild(input)
    })
    document.body.appendChild(form)
    form.submit()
  }

  const handleBuyVoucher = () => {
    // Redirect to payment page with all Omada params
    const params = new URLSearchParams()
    if (clientMac)   params.set('clientMac', clientMac)
    if (apMac)       params.set('apMac', apMac)
    if (ssidName)    params.set('ssidName', ssidName)
    if (site)        params.set('site', site)
    if (t)           params.set('t', t)
    if (gatewayMac)  params.set('gatewayMac', gatewayMac)
    if (radioId)     params.set('radioId', radioId)
    if (vid)         params.set('vid', vid)
    if (redirectUrl) params.set('redirectUrl', redirectUrl)
    if (originUrl) params.set('originUrl', originUrl)
    if (tp)          params.set('tp', tp)

    window.location.href = `/guest/login?${params.toString()}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-gray-900 flex flex-col items-center justify-center px-4 py-8">

      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur rounded-3xl mb-4 shadow-xl">
          <Wifi className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">TIPAC SUMMIT</h1>
        <p className="text-brand-200 text-sm mt-1">Internet ya Wi-Fi yenye kasi</p>
        {ssidName && <p className="text-brand-400 text-xs mt-1">📶 {ssidName}</p>}
      </div>

      {/* Buy voucher card */}
      <div className="w-full max-w-sm mb-4">
        <button onClick={handleBuyVoucher}
          className="w-full bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500
            text-gray-900 font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95
            flex items-center justify-center gap-3 text-lg">
          <ShoppingCart className="w-6 h-6" />
          Nunua vocha
        </button>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[{price:'200 TZS',dur:'7 min'},{price:'500 TZS',dur:'6 hrs'},{price:'1,000 TZS',dur:'24 hrs'}].map(p => (
            <div key={p.price} className="bg-white/5 rounded-xl p-2 text-center">
              <p className="text-white text-xs font-bold">{p.price}</p>
              <p className="text-brand-300 text-xs">{p.dur.replace('min', 'dak').replace('hrs', 'saa')}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Login card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button onClick={() => { setTab('voucher'); setError('') }}
            className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors
              ${tab === 'voucher' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <Ticket className="w-4 h-4" /> Vocha
          </button>
          <button onClick={() => { setTab('user'); setError('') }}
            className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors
              ${tab === 'user' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <User className="w-4 h-4" /> Jina la mtumiaji
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {tab === 'voucher' ? (
            <form onSubmit={handleVoucherLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Namba ya vocha</label>
                <div className="relative">
                  <Ticket className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={voucher}
                    onChange={e => setVoucher(e.target.value)}
                    placeholder="Weka namba ya vocha"
                    className="input-field pl-10 font-mono tracking-wider text-lg"
                    autoComplete="off"
                    autoFocus
                    disabled={loading}
                  />
                </div>
              </div>
              <button type="submit" disabled={loading || !voucher.trim()}
                className="btn-primary w-full py-4 text-base">
                {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Inaunganisha…</span> : 'Unganisha'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUserLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Jina la mtumiaji</label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                    placeholder="Jina la mtumiaji" className="input-field pl-10" disabled={loading} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Neno la siri</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Neno la siri" className="input-field pl-10 pr-10" disabled={loading} />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading || !username || !password}
                className="btn-primary w-full py-4 text-base">
                {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Inaingia…</span> : 'Ingia'}
              </button>
            </form>
          )}
        </div>

        <div className="px-6 pb-5 text-center">
          <p className="text-gray-400 text-xs">Huna vocha? <button onClick={handleBuyVoucher} className="text-brand-600 font-medium hover:underline">Nunua hapa</button></p>
        </div>
      </div>

      <p className="text-brand-400 text-xs mt-6">TIPAC SUMMIT Wi-Fi · MalipoPay</p>
    </div>
  )
}
