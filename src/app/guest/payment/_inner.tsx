'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { CheckCircle, XCircle, Smartphone, RefreshCw, Wifi, ArrowRight, Copy, Check } from 'lucide-react'
import type { TransactionStatus } from '@/lib/types'

export default function PaymentInner() {
  const searchParams = useSearchParams()
  const reference   = searchParams.get('reference') || ''
  const phone       = searchParams.get('phone')     || ''
  const packageName = searchParams.get('pkg')       || ''
  const amountStr   = searchParams.get('amount')    || ''
  const redirectUrl = searchParams.get('redirect')  || ''
  const [portalUrl, setPortalUrl] = useState('')

  const [status, setStatus]         = useState<TransactionStatus>('PAYMENT_INITIATED')
  const [message, setMessage]       = useState('')
  const [voucherCode, setVoucherCode] = useState('')
  const [copied, setCopied]         = useState(false)
  const [dots, setDots]             = useState(0)
  const [waitSeconds, setWaitSeconds] = useState(0)
  const pollRef  = useRef<ReturnType<typeof setTimeout>>()
  const countRef = useRef(0)

  const maskedPhone = phone.replace(/(\d{3})(\d+)(\d{4})$/, (_, a, b, c) => a + b.replace(/\d/g, '×') + c)

  useEffect(() => {
    if (!reference) { window.location.href = '/guest/login'; return }
    poll()
    const di = setInterval(() => setDots(d => (d + 1) % 4), 500)
    const wi = setInterval(() => setWaitSeconds(s => s + 1), 1000)
    return () => { clearInterval(di); clearInterval(wi); clearTimeout(pollRef.current) }
  }, [reference])

  const poll = async () => {
    try {
      const res  = await fetch(`/api/payment/status/${reference}`)
      const data = await res.json()
      if (data.success) {
        setStatus(data.data.status)
        setMessage(data.data.message || '')
        if (data.data.voucherCode) setVoucherCode(data.data.voucherCode)
        if (data.data.portalUrl) setPortalUrl(data.data.portalUrl)
      }
      const pending = ['PENDING', 'PAYMENT_INITIATED', 'PAYMENT_SUCCESS', 'OMADA_AUTHORIZING']
      if (pending.includes(data.data?.status) && countRef.current < 300) {
        countRef.current++
        pollRef.current = setTimeout(poll, 3000)
      }
    } catch {
      if (countRef.current < 300) { countRef.current++; pollRef.current = setTimeout(poll, 3000) }
    }
  }

  const copyVoucher = async () => {
    await navigator.clipboard.writeText(voucherCode)
    setCopied(true)
    setTimeout(() => {
      // Redirect back to Omada portal with voucher pre-filled if redirectUrl exists
      if (portalUrl) {
        const target = new URL(portalUrl, window.location.origin)
        target.searchParams.set('voucher', voucherCode)
        window.location.href = target.toString()
      } else if (redirectUrl) {
        const target = new URL(decodeURIComponent(redirectUrl), window.location.origin)
        target.searchParams.set('voucher', voucherCode)
        window.location.href = target.toString()
      }
    }, 1500)
  }

  const isSuccess = status === 'AUTHORIZED' || (status === 'PAYMENT_SUCCESS' && voucherCode)
  const isFailed  = ['PAYMENT_FAILED','PAYMENT_CANCELLED','PAYMENT_TIMEOUT','AUTHORIZATION_FAILED','EXPIRED'].includes(status)

  // ── Success screen ──────────────────────────────────────────────────────────
  if (isSuccess && voucherCode) return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Payment Successful!</h1>
          {packageName && <p className="text-gray-500 text-sm mb-5">{packageName}{amountStr ? ` — TZS ${parseInt(amountStr).toLocaleString()}` : ''}</p>}

          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl p-5 mb-5">
            <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Your Voucher Code</p>
            <p className="text-3xl font-bold font-mono text-gray-900 tracking-widest">{voucherCode}</p>
          </div>

          <button onClick={copyVoucher}
            className={`w-full font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 text-lg mb-3
              ${copied ? 'bg-green-500 text-white' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}>
            {copied
              ? <><Check className="w-5 h-5" /> Copied! Redirecting…</>
              : <><Copy className="w-5 h-5" /> Copy Code</>}
          </button>

          {(portalUrl || redirectUrl) && !copied && (
            <button onClick={() => window.location.href = portalUrl || decodeURIComponent(redirectUrl)}
              className="w-full text-gray-500 text-sm flex items-center justify-center gap-1 hover:text-gray-700">
              Go to Wi-Fi Login <ArrowRight className="w-4 h-4" />
            </button>
          )}

          <p className="text-gray-400 text-xs mt-4">Enter this code in the Wi-Fi login page</p>
        </div>
        <p className="text-green-200 text-xs mt-4">TIPAC SUMMIT Wi-Fi</p>
      </div>
    </div>
  )

  // ── Failed screen ───────────────────────────────────────────────────────────
  if (isFailed) {
    const token = new URLSearchParams(window.location.search).get('token')
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <div className="bg-white rounded-3xl p-8 shadow-2xl">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-12 h-12 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {status === 'PAYMENT_CANCELLED' ? 'Payment Cancelled' :
               status === 'PAYMENT_TIMEOUT'   ? 'Payment Timed Out' : 'Payment Failed'}
            </h1>
            <p className="text-gray-500 mb-6">{message || 'Please try again.'}</p>
            <div className="bg-red-50 rounded-xl p-3 mb-6">
              <p className="text-red-600 text-xs">Ref: {reference}</p>
            </div>
            <div className="space-y-3">
              <button onClick={() => token ? (window.location.href = `/guest/packages?token=${encodeURIComponent(token)}`) : window.history.back()}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl transition-colors">
                Try Again
              </button>
              <button onClick={() => window.location.href = '/guest/login'}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl transition-colors text-sm">
                Start Over
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Waiting screen ──────────────────────────────────────────────────────────
  const statusLabel = status === 'OMADA_AUTHORIZING' || status === 'PAYMENT_SUCCESS'
    ? 'Preparing your voucher…'
    : `Waiting for payment${'.' .repeat(dots + 1)}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-brand-100 rounded-full animate-ping opacity-30" />
            <div className="relative w-24 h-24 bg-brand-50 rounded-full flex items-center justify-center">
              <Smartphone className="w-12 h-12 text-brand-600" />
            </div>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {status === 'OMADA_AUTHORIZING' || status === 'PAYMENT_SUCCESS' ? 'Payment Confirmed!' : 'Check Your Phone'}
          </h1>

          {status !== 'OMADA_AUTHORIZING' && status !== 'PAYMENT_SUCCESS' && (
            <>
              {packageName && (
                <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-2 mb-3 inline-block">
                  <p className="text-brand-700 text-sm font-semibold">📦 {packageName}</p>
                  {amountStr && <p className="text-brand-500 text-xs">TZS {parseInt(amountStr).toLocaleString()}</p>}
                </div>
              )}
              <p className="text-gray-500 mb-4">Payment request sent to:</p>
              <div className="bg-brand-50 rounded-xl py-3 px-4 mb-4 inline-block">
                <p className="text-brand-800 font-mono font-bold text-lg tracking-wider">{maskedPhone}</p>
              </div>
              <p className="text-gray-500 text-sm mb-6">Enter your <strong>mobile money PIN</strong></p>
            </>
          )}

          {(status === 'OMADA_AUTHORIZING' || status === 'PAYMENT_SUCCESS') && (
            <p className="text-gray-500 text-sm mb-6">Generating your voucher code…</p>
          )}

          <div className="flex items-center justify-center gap-1.5 mb-6">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />
            ))}
            <span className="text-brand-600 text-sm ml-2">{statusLabel}</span>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 text-left">
            <p className="text-gray-400 text-xs">Reference: <span className="font-mono">{reference}</span></p>
          </div>

          <button onClick={poll} className="mt-4 text-brand-500 text-sm flex items-center gap-1 mx-auto hover:text-brand-700">
            <RefreshCw className="w-3.5 h-3.5" /> Check status
          </button>

          {waitSeconds > 180 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-gray-400 text-xs mb-2">Taking too long?</p>
              <button onClick={() => {
                const token = new URLSearchParams(window.location.search).get('token')
                window.location.href = token ? `/guest/packages?token=${encodeURIComponent(token)}` : '/guest/login'
              }} className="text-red-400 hover:text-red-600 text-sm font-medium">
                Cancel and try again
              </button>
            </div>
          )}
        </div>
        <p className="text-brand-300 text-xs text-center mt-4">Secured by MalipoPay · TIPAC SUMMIT</p>
      </div>
    </div>
  )
}
