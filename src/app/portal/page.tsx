import { Suspense } from 'react'
import PortalInner from './_inner'
export const dynamic = 'force-dynamic'
export default function PortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full border-4 border-white/25 border-t-white animate-spin mx-auto mb-4 shadow-[0_0_30px_rgba(255,255,255,0.18)]" />
          <p className="text-white font-black text-xl tracking-tight">KASI Wi-Fi</p>
          <p className="text-brand-100 text-sm mt-1">Inatengeneza session yako…</p>
        </div>
      </div>
    }>
      <PortalInner />
    </Suspense>
  )
}
