'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { CheckCircle, XCircle, Smartphone, RefreshCw, Wifi, ArrowRight, AlertCircle } from 'lucide-react'
import type { TransactionStatus } from '@/lib/types'

export default function PaymentInner() {
  const searchParams = useSearchParams()
  const reference = searchParams.get('reference') || ''
  const phone = searchParams.get('phone') || ''
  const packageName = searchParams.get('pkg') || ''
  const amountStr = searchParams.get('amount') || ''

  const [status, setStatus] = useState<TransactionStatus>('PAYMENT_INITIATED')
  const [message, setMessage] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [dots, setDots] = useState(0)
  const [waitSeconds, setWaitSeconds] = useState(0)
  const pollRef = useRef<ReturnType<typeof setTimeout>>()
  const countRef = useRef(0)

  const maskedPhone = phone.replace(/(\d{3})(\d+)(\d{4})$/, (_, a, b, c) => a + b.replace(/\d/g, '×') + c)

  useEffect(() => {
    if (!reference) { window.location.href = '/guest/login'; return }
    poll()
    const dotsInterval = setInterval(() => setDots(d => (d + 1) % 4), 500)
    const waitInterval = setInterval(() => setWaitSeconds(s => s + 1), 1000)
    return () => { clearInterval(dotsInterval); clearInterval(waitInterval); clearTimeout(pollRef.current) }
  }, [reference])

  const poll = async () => {
    try {
      const res = await fetch(`/api/payment/status/${reference}`)
      const data = await res.json()
      if (data.success) {
        setStatus(data.data.status)
        setMessage(data.data.message || '')
        if (data.data.redirectUrl) setRedirectUrl(data.data.redirectUrl)
      }
      // Continue polling while pending
      const pending = ['PENDING', 'PAYMENT_INITIATED', 'PAYMENT_SUCCESS', 'OMADA_AUTHORIZING']
      if (pending.includes(data.data?.status) && countRef.current < 60) {
        countRef.current++
        pollRef.current = setTimeout(poll, 3000)
      }
    } catch {
      if (countRef.current < 60) {
        countRef.current++
        pollRef.current = setTimeout(poll, 3000)
      }
    }
  }

  const terminal = ['AUTHORIZED', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_TIMEOUT', 'AUTHORIZATION_FAILED', 'EXPIRED']
  const isTerminal = terminal.includes(status)
  const isSuccess = status === 'AUTHORIZED'
  const isFailed = ['PAYMENT_FAILED', 'PAYMENT_CANCELLED', 'PAYMENT_TIMEOUT', 'AUTHORIZATION_FAILED', 'EXPIRED'].includes(status)

  if (isSuccess) return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-emerald-700 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
          <p className="text-gray-500 mb-6">Your internet access is now active. Enjoy browsing!</p>

          <div className="bg-green-50 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Wifi className="w-8 h-8 text-green-500 shrink-0" />
            <div className="text-left">
              <p className="font-semibold text-green-800">
                {packageName ? `${packageName} Activated` : 'Internet Activated'}
              </p>
              {amountStr && (
                <p className="text-green-600 text-sm">TZS {parseInt(amountStr).toLocaleString()} paid successfully</p>
              )}
            </div>
          </div>

          <p className="text-gray-400 text-xs mb-5">Ref: {reference}</p>

          <button
            onClick={() => redirectUrl ? (window.location.href = redirectUrl) : (window.location.href = '/')}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl
              transition-colors flex items-center justify-center gap-2">
            Start Browsing <ArrowRight className="w-5 h-5" />
          </button>
        </div>
        <p className="text-green-200 text-xs mt-4">TIPAC SUMMIT Wi-Fi</p>
      </div>
    </div>
  )

  if (isFailed) return (
    <div className="min-h-screen bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-12 h-12 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {status === 'PAYMENT_CANCELLED' ? 'Payment Cancelled' :
             status === 'PAYMENT_TIMEOUT' ? 'Payment Timed Out' : 'Payment Failed'}
          </h1>
          <p className="text-gray-500 mb-6">
            {message || 'Your payment could not be processed. Please try again.'}
          </p>

          <div className="bg-red-50 rounded-xl p-3 mb-6">
            <p className="text-red-600 text-xs">Ref: {reference}</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                // Get session token from referrer URL or go back to login
                const token = new URLSearchParams(window.location.search).get('token')
                if (token) {
                  window.location.href = `/guest/packages?token=${encodeURIComponent(token)}`
                } else {
                  window.location.href = '/guest/login'
                }
              }}
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

  // Waiting / pending state
  const statusLabel = status === 'OMADA_AUTHORIZING' || status === 'PAYMENT_SUCCESS'
    ? 'Activating your access…'
    : `Waiting for payment${'.'.repeat(dots + 1)}`

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
          {/* Animated phone icon */}
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-brand-100 rounded-full animate-ping opacity-30" />
            <div className="relative w-24 h-24 bg-brand-50 rounded-full flex items-center justify-center">
              <Smartphone className="w-12 h-12 text-brand-600" />
            </div>
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {status === 'OMADA_AUTHORIZING' || status === 'PAYMENT_SUCCESS'
              ? 'Payment Confirmed!' : 'Check Your Phone'}
          </h1>

          {status !== 'OMADA_AUTHORIZING' && status !== 'PAYMENT_SUCCESS' && (
            <>
              {packageName && (
                <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-2 mb-3 inline-block">
                  <p className="text-brand-700 text-sm font-semibold">📦 {packageName}</p>
                  {amountStr && <p className="text-brand-500 text-xs">TZS {parseInt(amountStr).toLocaleString()}</p>}
                </div>
              )}
              <p className="text-gray-500 mb-4">A payment request has been sent to:</p>
              <div className="bg-brand-50 rounded-xl py-3 px-4 mb-4 inline-block">
                <p className="text-brand-800 font-mono font-bold text-lg tracking-wider">{maskedPhone}</p>
              </div>
              <p className="text-gray-500 text-sm mb-6">Enter your <strong>mobile money PIN</strong> to complete payment</p>
            </>
          )}

          {(status === 'OMADA_AUTHORIZING' || status === 'PAYMENT_SUCCESS') && (
            <>
              {packageName && (
                <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-2 mb-3 inline-block">
                  <p className="text-green-700 text-sm font-semibold">✅ {packageName} activated</p>
                </div>
              )}
              <p className="text-gray-500 text-sm mb-6">Activating your internet access, please wait…</p>
            </>
          )}

          {/* Progress indicator */}
          <div className="flex items-center justify-center gap-1.5 mb-6">
            {[0,1,2].map(i => (
              <div key={i} className={`w-2 h-2 rounded-full bg-brand-500 animate-bounce`}
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
            <span className="text-brand-600 text-sm ml-2">{statusLabel}</span>
          </div>

          <div className="bg-gray-50 rounded-xl p-3 text-left space-y-1">
            <p className="text-gray-400 text-xs">Transaction Reference</p>
            <p className="text-gray-700 text-xs font-mono">{reference}</p>
          </div>

          <button onClick={poll} className="mt-4 text-brand-500 text-sm flex items-center gap-1 mx-auto hover:text-brand-700">
            <RefreshCw className="w-3.5 h-3.5" /> Check status manually
          </button>

          {/* After 2 minutes show cancel option */}
          {waitSeconds > 120 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-gray-400 text-xs mb-2">Taking too long? You can go back and try again.</p>
              <button
                onClick={() => {
                  const token = new URLSearchParams(window.location.search).get('token')
                  window.location.href = token
                    ? `/guest/packages?token=${encodeURIComponent(token)}`
                    : '/guest/login'
                }}
                className="text-red-400 hover:text-red-600 text-sm font-medium transition-colors">
                Cancel and try again
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <p className="text-brand-300 text-xs">Secured by MalipoPay · TIPAC SUMMIT</p>
        </div>
      </div>
    </div>
  )
}
