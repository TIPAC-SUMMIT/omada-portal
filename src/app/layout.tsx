import type { Metadata, Viewport } from 'next'
import './globals.css'
import GuestFooter from './guest-footer'

export const metadata: Metadata = {
  title: 'TIPAC SUMMIT | Wi-Fi Access Portal',
  description: 'Purchase internet access with mobile money — TIPAC SUMMIT',
  robots: 'noindex, nofollow',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-gray-50">
        <div className="min-h-screen flex flex-col">
          <div className="flex-1">{children}</div>
          <GuestFooter />
        </div>
      </body>
    </html>
  )
}
