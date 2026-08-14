import type { Metadata, Viewport } from 'next'
import './globals.css'

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
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  )
}
