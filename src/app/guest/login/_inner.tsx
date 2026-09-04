'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Wifi, AlertCircle, Loader2 } from 'lucide-react'
import type { OmadaRedirectParams } from '@/lib/types'

export default function GuestLoginInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { initializePortalSession() }, [])

  const initializePortalSession = async () => {
    try {
      const params: OmadaRedirectParams = {
        clientMac:   searchParams.get('clientMac')   || '',
        apMac:       searchParams.get('apMac')       || '',
        ssidName:    searchParams.get('ssidName')    || '',
        site:        searchParams.get('site')        || undefined,
        t:           searchParams.get('t')           || undefined,
        gatewayMac:  searchParams.get('gatewayMac')  || undefined,
        radioId:     searchParams.get('radioId')     || undefined,
        vid:         searchParams.get('vid')         || undefined,
        originUrl:   searchParams.get('originUrl')   || undefined,
        redirectUrl: searchParams.get('redirectUrl') || undefined,
        portalAuthUrl: searchParams.get('tp') || undefined,
      }

      if (!params.clientMac || !params.apMac || !params.ssidName) {
        setError('Taarifa za kuunganisha Wi-Fi si sahihi. Zima kisha washa Wi-Fi ujaribu tena.')
        setLoading(false)
        return
      }

      const response = await fetch('/api/portal/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Imeshindikana kuanzisha ukurasa wa Wi-Fi.')
      }

      const data = await response.json()
      const token = encodeURIComponent(data.data.sessionToken)
      const portalParams = new URLSearchParams()
      for (const key of ['clientMac', 'apMac', 'ssidName', 'site', 't', 'gatewayMac', 'radioId', 'vid', 'originUrl', 'redirectUrl', 'tp']) {
        const value = searchParams.get(key)
        if (value) portalParams.set(key, value)
      }
      // Use window.location for a hard redirect — more reliable than router.push
      // when the component is still in a loading state
      window.location.href = `/guest/packages?token=${token}&${portalParams.toString()}`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Imeshindikana kuanzisha ukurasa wa Wi-Fi.')
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-700 to-brand-900">
      <div className="text-center px-6">
        <div className="mb-4 rounded-full bg-white/10 p-4 shadow-[0_0_30px_rgba(255,255,255,0.18)] backdrop-blur-sm">
          <Wifi className="w-14 h-14 text-white mx-auto animate-pulse" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white mb-1 drop-shadow-md">KASI Wi-Fi</h1>
        <p className="text-brand-100 text-sm mb-8">Inatengeneza session yako…</p>
        <div className="bg-white/10 rounded-2xl p-6 max-w-sm mx-auto border border-white/10 shadow-2xl backdrop-blur-sm">
          <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-3" />
          <p className="text-white font-medium">Inatengeneza session yako…</p>
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-700 to-brand-900 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-3">Tatizo la kuunganisha</h1>
        <p className="text-gray-600 mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary w-full">Jaribu tena</button>
      </div>
    </div>
  )

  return null
}
