'use client'
import { useEffect, useState } from 'react'
import { RefreshCw, Wifi } from 'lucide-react'
import type { AuthorizationStatus } from '@/lib/types'

interface Session {
  id: string; record_type: 'AUTHORIZATION' | 'PAYMENT'; client_mac: string; ap_mac: string; ssid_name: string
  status: AuthorizationStatus | string; duration_seconds?: number; amount_tzs?: number
  authorized_at?: string; expires_at?: string; created_at: string; reference?: string
  error_code?: string | null; error_message?: string | null
  sites: { name: string } | null
  packages: { name: string } | null
}

export default function SessionsPage() {
  const [rows, setRows] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/admin/sessions', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) setRows(data.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const fmt = (d: string) => new Date(d).toLocaleString('en-TZ', { dateStyle: 'short', timeStyle: 'short' })

  const statusBadge = (s: AuthorizationStatus, expires: string) => {
    const expired = expires && new Date(expires) < new Date()
    if (expired || s === 'EXPIRED') return <span className="status-error">EXPIRED</span>
    if (s === 'REVOKED') return <span className="status-error">REVOKED</span>
    return <span className="status-success">ACTIVE</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Active Sessions</h1>
        <button onClick={load} className="btn-secondary py-2 px-4 text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              {['Type','Client MAC','Site','AP','Package','Start Time','Expires','Status','Issue'].map(h => (
                <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-400">No active sessions or pending operations</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs">{r.record_type === 'PAYMENT' ? 'PAYMENT' : 'SESSION'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.client_mac}</td>
                <td className="px-4 py-3 text-gray-500">{r.sites?.name ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.ap_mac}</td>
                <td className="px-4 py-3 text-gray-500">{r.packages?.name ?? (r.amount_tzs ? `${r.amount_tzs} TZS` : '—')}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(r.authorized_at ?? r.created_at)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.expires_at ? fmt(r.expires_at) : '—'}</td>
                <td className="px-4 py-3">{r.record_type === 'AUTHORIZATION' ? statusBadge(r.status as AuthorizationStatus, r.expires_at ?? '') : <span className={r.status === 'AUTHORIZATION_FAILED' ? 'status-error' : 'status-pending'}>{r.status}</span>}</td>
                <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate" title={r.error_message ?? undefined}>{r.error_message ?? r.reference ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
