'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, MapPin, Package, CreditCard, Monitor, ClipboardList, LogOut, Menu, X, Wifi } from 'lucide-react'

const navItems = [
  { href: '/admin/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/sites',        icon: MapPin,           label: 'Sites' },
  { href: '/admin/packages',     icon: Package,          label: 'Packages' },
  { href: '/admin/transactions', icon: CreditCard,       label: 'Transactions' },
  { href: '/admin/sessions',     icon: Monitor,          label: 'Active Sessions' },
  { href: '/admin/audit-logs',   icon: ClipboardList,    label: 'Audit Logs' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [adminName, setAdminName] = useState('')
  const [adminRole, setAdminRole] = useState('')
  const [checked, setChecked] = useState(false)

  // Skip layout wrapper for login page
  const isLoginPage = pathname === '/admin/login'

  useEffect(() => {
    if (isLoginPage) { setChecked(true); return }

    const token = localStorage.getItem('admin_token')
    if (!token) { router.replace('/admin/login'); return }

    fetch('/api/admin/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (!data.success) { router.replace('/admin/login'); return }
        setAdminName(data.data.name)
        setAdminRole(data.data.role)
        setChecked(true)
      })
      .catch(() => router.replace('/admin/login'))
  }, [pathname])

  const handleLogout = async () => {
    const token = localStorage.getItem('admin_token')
    await fetch('/api/admin/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    localStorage.removeItem('admin_token')
    router.replace('/admin/login')
  }

  // Login page — render without sidebar
  if (isLoginPage) return <>{children}</>

  // Still checking auth — show nothing to avoid flash
  if (!checked) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-4 border-brand-600 border-t-transparent animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-gradient-to-b from-brand-900 to-brand-800 flex flex-col
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:static lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-brand-700">
          <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0">
            <Wifi className="w-5 h-5 text-brand-300" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight">TIPAC SUMMIT</p>
            <p className="text-brand-400 text-xs">Wi-Fi Platform</p>
          </div>
          <button className="ml-auto lg:hidden text-brand-400 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href} onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-white/15 text-white' : 'text-brand-300 hover:bg-white/10 hover:text-white'}`}>
                <Icon className="w-5 h-5 shrink-0" />{label}
              </Link>
            )
          })}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-brand-700">
          {adminName && (
            <div className="mb-3">
              <p className="text-white text-sm font-medium truncate">{adminName}</p>
              <p className="text-brand-400 text-xs">{adminRole}</p>
            </div>
          )}
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-brand-400 hover:text-red-400 text-sm w-full transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-600 hover:text-gray-900">
            <Menu className="w-6 h-6" />
          </button>
          <Wifi className="w-5 h-5 text-brand-600" />
          <span className="font-semibold text-gray-900">TIPAC SUMMIT Admin</span>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
