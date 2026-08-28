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
        redirectUrl: searchParams.get('redirectUrl') || undefined,
        portalAuthUrl: searchParams.get('tp') || undefined,
      }

      if (!params.clientMac || !params.apMac || !params.ssidName) {
        setError('Invalid captive portal parameters. Please reconnect to Wi-Fi and try again.')
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
        throw new Error(err.error || 'Failed to create portal session')
      }

      const data = await response.json()
      const token = encodeURIComponent(data.data.sessionToken)
      // Use window.location for a hard redirect — more reliable than router.push
      // when the component is still in a loading state
      window.location.href = `/guest/packages?token=${token}`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to initialize portal session')
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-700 to-brand-900">
      <div className="text-center px-6">
        <Wifi className="w-16 h-16 text-white mx-auto mb-4 animate-pulse" />
        <h1 className="text-2xl font-bold text-white mb-1">TIPAC SUMMIT</h1>
        <p className="text-brand-200 text-sm mb-8">Wi-Fi Access Portal</p>
        <div className="bg-white/10 rounded-xl p-6 max-w-sm mx-auto">
          <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-3" />
          <p className="text-white">Setting up your session…</p>
        </div>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-700 to-brand-900 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <AlertCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-3">Connection Error</h1>
        <p className="text-gray-600 mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary w-full">Try Again</button>
      </div>
    </div>
  )

  return null
}
