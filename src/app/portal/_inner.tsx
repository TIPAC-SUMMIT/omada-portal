'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Wifi, Eye, EyeOff, Loader2, User, Lock, ShoppingCart } from 'lucide-react'

export default function PortalPage() {
  const searchParams = useSearchParams()

  const clientMac = searchParams.get('clientMac') || ''
  const apMac = searchParams.get('apMac') || ''
  const ssidName = searchParams.get('ssidName') || ''
  const site = searchParams.get('site') || ''
  const t = searchParams.get('t') || ''
  const gatewayMac = searchParams.get('gatewayMac') || ''
  const radioId = searchParams.get('radioId') || ''
  const vid = searchParams.get('vid') || ''
  const redirectUrl = searchParams.get('redirectUrl') || ''
  const originUrl = searchParams.get('originUrl') || redirectUrl
  const tp = searchParams.get('tp') || ''
  const sessionToken = searchParams.get('token') || ''

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const omadaSubmitUrl = tp

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Weka jina la mtumiaji na neno la siri')
      return
    }

    setLoading(true)
    setError('')

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
      clientMac,
      apMac,
      ssidName,
      gatewayMac,
      radioId,
      vid,
      originUrl,
      authType: '5',
    }

    Object.entries(fields).forEach(([key, value]) => {
      if (!value) return
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = value
      form.appendChild(input)
    })

    if (sessionToken) {
      const tokenInput = document.createElement('input')
      tokenInput.type = 'hidden'
      tokenInput.name = 'token'
      tokenInput.value = sessionToken
      form.appendChild(tokenInput)
    }

    document.body.appendChild(form)
    form.submit()
  }

  const handleBuyPackage = () => {
    const params = new URLSearchParams()
    if (clientMac) params.set('clientMac', clientMac)
    if (apMac) params.set('apMac', apMac)
    if (ssidName) params.set('ssidName', ssidName)
    if (site) params.set('site', site)
    if (t) params.set('t', t)
    if (gatewayMac) params.set('gatewayMac', gatewayMac)
    if (radioId) params.set('radioId', radioId)
    if (vid) params.set('vid', vid)
    if (redirectUrl) params.set('redirectUrl', redirectUrl)
    if (originUrl) params.set('originUrl', originUrl)
    if (tp) params.set('tp', tp)
    if (sessionToken) params.set('token', sessionToken)

    window.location.href = `/guest/packages?${params.toString()}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-gray-900 flex flex-col items-center justify-center px-4 py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 backdrop-blur rounded-3xl mb-4 shadow-xl">
          <Wifi className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-md">KASI Wi-Fi</h1>
        <p className="text-brand-100 text-sm mt-1">Internet ya Wi-Fi yenye kasi</p>
        {ssidName && <p className="text-brand-400 text-xs mt-1">📶 {ssidName}</p>}
      </div>

      <div className="w-full max-w-sm mb-4">
        <button
          type="button"
          onClick={handleBuyPackage}
          className="w-full bg-gradient-to-r from-yellow-400 to-orange-400 hover:from-yellow-500 hover:to-orange-500 text-gray-900 font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3 text-lg"
        >
          <ShoppingCart className="w-6 h-6" />
          Chagua kifurushi
        </button>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <form onSubmit={handleUserLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Jina la mtumiaji</label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Jina la mtumiaji"
                  className="input-field pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Neno la siri</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Neno la siri"
                  className="input-field pl-10 pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn-primary w-full py-4 text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Inaingia…
                </span>
              ) : (
                'Ingia'
              )}
            </button>
          </form>
        </div>
      </div>

      <p className="text-brand-300 text-xs mt-6">KASI Wi-Fi · MalipoPay</p>
    </div>
  )
}
