'use client'

import { usePathname } from 'next/navigation'

export default function GuestFooter() {
  const pathname = usePathname()
  if (!pathname || (!pathname.startsWith('/guest') && pathname !== '/portal')) return null

  return (
    <footer className="border-t border-gray-200 bg-white px-4 py-5 text-center text-sm text-gray-600">
      <p>
        Kwa msaada piga namba{' '}
        <a className="font-semibold text-brand-600 hover:text-brand-700" href="tel:0704170040">
          0704 170 040
        </a>
        {' '}au{' '}
        <a className="font-semibold text-brand-600 hover:text-brand-700" href="tel:0749779776">
          0749 779 776
        </a>
      </p>
    </footer>
  )
}
