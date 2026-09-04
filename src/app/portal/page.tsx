import { Suspense } from 'react'
import PortalInner from './_inner'
export const dynamic = 'force-dynamic'
export default function PortalPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-brand-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-white/30 border-t-white animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold text-lg">KASI WIFI</p>
          <p className="text-brand-300 text-sm mt-1">Inatengeneza session yako…</p>
        </div>
      </div>
    }>
      <PortalInner />
    </Suspense>
  )
}
