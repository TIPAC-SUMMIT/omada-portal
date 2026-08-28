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
  const radioId    = searchParams.get('radioId')    || ''
  const vid        = searchParams.get('vid')        || ''
  const redirectUrl = searchParams.get('redirectUrl') || ''
  const tp         = searchParams.get('tp')         || '' // Omada submit URL base

  const [tab, setTab] = useState<'voucher' | 'user'>('voucher')
  const [voucher, setVoucher] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Pre-fill voucher if redirected back from payment page with ?voucher=CODE
  useEffect(() => {
    const preVoucher = searchParams.get('voucher')
    if (preVoucher) setVoucher(preVoucher)
  }, [])

  // Build the submit URL that Omada controller listens on
  // Omada provides the submit base via the page config — for now we use the tp param
  const omadaSubmitUrl = tp ? decodeURIComponent(tp) : ''

  const handleVoucherLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!voucher.trim()) { setError('Please enter your voucher code'); return }
    if (!omadaSubmitUrl) { setError('Wi-Fi controller login URL is missing. Please reconnect to Wi-Fi and try again.'); return }
    setLoading(true); setError('')

    // Submit to Omada controller directly (standard portal submit)
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = omadaSubmitUrl

    const fields: Record<string, string> = {
      voucherCode: voucher.trim(),
      clientMac, apMac, ssidName, radioId, vid,
      redirectUrl,
      authType: '3', // VOUCHER_ACCESS_TYPE
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
    if (!username.trim() || !password) { setError('Enter username and password'); return }
    if (!omadaSubmitUrl) { setError('Wi-Fi controller login URL is missing. Please reconnect to Wi-Fi and try again.'); return }
    setLoading(true); setError('')

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = omadaSubmitUrl

    const fields: Record<string, string> = {
      username: username.trim(),
      password,
      clientMac, apMac, ssidName, radioId, vid,
      redirectUrl,
      authType: '5', // LOCAL_USER_ACCESS_TYPE
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
    if (radioId)     params.set('radioId', radioId)
    if (vid)         params.set('vid', vid)
    if (redirectUrl) params.set('redirectUrl', redirectUrl)
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
        <p className="text-brand-200 text-sm mt-1">High-Speed Wi-Fi Access</p>
        {ssidName && <p className="text-brand-400 text-xs mt-1">📶 {ssidName}</p>}
      </div>

      {/* Buy voucher card */}
      <div className="w-full max-w-sm mb-4">
        <button onClick={handleBuyVoucher}
          className="w-full bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500
            text-gray-900 font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95
            flex items-center justify-center gap-3 text-lg">
          <ShoppingCart className="w-6 h-6" />
          Buy Voucher
        </button>
        <div className="grid grid-cols-3 gap-2 mt-2">
          {[{price:'200 TZS',dur:'7 min'},{price:'500 TZS',dur:'6 hrs'},{price:'1,000 TZS',dur:'24 hrs'}].map(p => (
            <div key={p.price} className="bg-white/5 rounded-xl p-2 text-center">
              <p className="text-white text-xs font-bold">{p.price}</p>
              <p className="text-brand-300 text-xs">{p.dur}</p>
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
            <Ticket className="w-4 h-4" /> Voucher
          </button>
          <button onClick={() => { setTab('user'); setError('') }}
            className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors
              ${tab === 'user' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
            <User className="w-4 h-4" /> Username
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Voucher Code</label>
                <div className="relative">
                  <Ticket className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={voucher}
                    onChange={e => setVoucher(e.target.value.toUpperCase())}
                    placeholder="Enter your code"
                    className="input-field pl-10 font-mono tracking-wider text-lg uppercase"
                    autoComplete="off"
                    autoFocus
                    disabled={loading}
                  />
                </div>
              </div>
              <button type="submit" disabled={loading || !voucher.trim()}
                className="btn-primary w-full py-4 text-base">
                {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Connecting…</span> : 'Connect'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleUserLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                    placeholder="Username" className="input-field pl-10" disabled={loading} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Password" className="input-field pl-10 pr-10" disabled={loading} />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading || !username || !password}
                className="btn-primary w-full py-4 text-base">
                {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Connecting…</span> : 'Log In'}
              </button>
            </form>
          )}
        </div>

        <div className="px-6 pb-5 text-center">
          <p className="text-gray-400 text-xs">Don't have a voucher? <button onClick={handleBuyVoucher} className="text-brand-600 font-medium hover:underline">Buy one here</button></p>
        </div>
      </div>

      <p className="text-brand-400 text-xs mt-6">TIPAC SUMMIT Wi-Fi · Powered by MalipoPay</p>
    </div>
  )
}
