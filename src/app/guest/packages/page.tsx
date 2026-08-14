import { Suspense } from 'react'
import PackagesInner from './_inner'

export const dynamic = 'force-dynamic'

export default function PackageSelectionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="card card-padding text-center max-w-sm w-full mx-4">
          <div className="w-10 h-10 rounded-full border-4 border-gray-200 border-t-brand-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading packages…</p>
        </div>
      </div>
    }>
      <PackagesInner />
    </Suspense>
  )
}
