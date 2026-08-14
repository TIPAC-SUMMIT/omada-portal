import { Suspense } from 'react'
import GuestLoginInner from './_inner'

export default function GuestLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-brand-700 to-brand-900">
        <div className="text-center px-6">
          <div className="w-12 h-12 rounded-full border-4 border-white/30 border-t-white animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold text-lg">TIPAC SUMMIT</p>
          <p className="text-brand-200 text-sm mt-1">Loading portal…</p>
        </div>
      </div>
    }>
      <GuestLoginInner />
    </Suspense>
  )
}
