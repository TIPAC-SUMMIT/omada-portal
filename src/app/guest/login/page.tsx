import { Suspense } from 'react'
import GuestLoginInner from './_inner'

export const dynamic = 'force-dynamic'

export default function GuestLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950">
        <div className="text-center px-6">
          <div className="w-14 h-14 rounded-full border-4 border-white/25 border-t-white animate-spin mx-auto mb-4 shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
          <p className="text-white font-black text-xl tracking-tight">KASI Wi-Fi</p>
          <p className="text-brand-100 text-sm mt-1">Inatengeneza session yako…</p>
        </div>
      </div>
    }>
      <GuestLoginInner />
    </Suspense>
  )
}
