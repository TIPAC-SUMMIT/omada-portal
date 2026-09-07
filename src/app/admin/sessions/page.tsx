'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { AuthorizationStatus } from '@/lib/types'

interface Session {
  id: string; record_type: 'AUTHORIZATION' | 'PAYMENT'; client_mac: string; ap_mac: string
  status: AuthorizationStatus | string; amount_tzs?: number; authorized_at?: string; expires_at?: string
  created_at: string; reference?: string; phone_number?: string | null; voucher_code?: string | null
  error_message?: string | null; sites: { name: string } | null; packages: { name: string } | null
  controller_name?: string | null
}

export default function SessionsPage() {
  const [rows, setRows] = useState<Session[]>([]), [loading, setLoading] = useState(true)
  const [controllers, setControllers] = useState<Array<{ id: string; name: string }>>([])
  const [accessPoints, setAccessPoints] = useState<Array<{ id: string; name: string | null; ap_mac: string }>>([])
  const [controllerId, setControllerId] = useState(''), [accessPointId, setAccessPointId] = useState('')
  const [page, setPage] = useState(1), [hasNextPage, setHasNextPage] = useState(false)
  const LIMIT = 20
  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_token') ?? ''}` })

  const load = async (p = 1, c = controllerId, a = accessPointId) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (c) params.set('controller_id', c); if (a) params.set('access_point_id', a)
      const data = await (await fetch(`/api/admin/sessions?${params}`, { headers: authHeaders() })).json()
      if (data.success) { setRows(data.data); setPage(p); setHasNextPage(Boolean(data.pagination?.hasNextPage)) }
    } finally { setLoading(false) }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/controllers', { headers: authHeaders() }).then(r => r.json()),
      fetch('/api/admin/access-points', { headers: authHeaders() }).then(r => r.json())
    ]).then(([c, a]) => { if (c.success) setControllers(c.data.controllers ?? []); if (a.success) setAccessPoints(a.data) }).catch(() => {})
    load()
  }, [])

  const fmt = (d: string) => new Date(d).toLocaleString('en-TZ', { dateStyle: 'short', timeStyle: 'short' })
  const badge = (s: AuthorizationStatus, expires?: string) => new Date(expires ?? 0) < new Date() || s === 'EXPIRED' ? <span className="status-error">EXPIRED</span> : s === 'REVOKED' ? <span className="status-error">REVOKED</span> : <span className="status-success">ACTIVE</span>

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-3 flex-wrap"><div><h1 className="text-2xl font-bold text-gray-900">Active Sessions</h1><p className="text-sm text-gray-500 mt-1">Live users and pending payment operations.</p></div><div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto"><select className="input-field py-2 text-sm" value={controllerId} onChange={e => { setControllerId(e.target.value); load(1, e.target.value, accessPointId) }}><option value="">All controllers</option>{controllers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select className="input-field py-2 text-sm" value={accessPointId} onChange={e => { setAccessPointId(e.target.value); load(1, controllerId, e.target.value) }}><option value="">All EAPs</option>{accessPoints.map(a => <option key={a.id} value={a.id}>{a.name || a.ap_mac}</option>)}</select><button onClick={() => load(page)} className="btn-secondary py-2 px-4 text-sm flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Refresh</button></div></div>
    <div className="card overflow-hidden">
      <div className="divide-y divide-gray-100 md:hidden">{loading ? <div className="p-8 text-center"><RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div> : rows.length === 0 ? <div className="p-8 text-center text-gray-400">No active sessions or pending operations</div> : rows.map(r => <div key={r.id} className="p-4 space-y-2"><div className="flex justify-between"><span className="text-xs">{r.record_type}</span>{r.record_type === 'AUTHORIZATION' ? badge(r.status as AuthorizationStatus, r.expires_at) : <span className="status-pending">{r.status}</span>}</div><div className="font-medium">{r.sites?.name ?? '—'} · {r.controller_name ?? 'Legacy controller'}</div><div className="text-xs text-gray-500">{r.ap_mac} · {r.client_mac}</div><div className="flex justify-between text-sm"><span>{r.phone_number ?? r.voucher_code ?? '—'}</span><span>{r.expires_at ? fmt(r.expires_at) : '—'}</span></div></div>)}</div>
      <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm min-w-[850px]"><thead className="bg-gray-50 text-gray-600 text-left"><tr>{['Type','Voucher','Phone','Client MAC','Site / Controller','EAP / AP','Package','Start Time','Expires','Status','Issue'].map(h => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{loading ? <tr><td colSpan={11} className="py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></td></tr> : rows.length === 0 ? <tr><td colSpan={11} className="py-8 text-center text-gray-400">No active sessions or pending operations</td></tr> : rows.map(r => <tr key={r.id}><td className="px-4 py-3 text-xs">{r.record_type}</td><td className="px-4 py-3 font-mono text-xs text-green-700">{r.voucher_code ?? '—'}</td><td className="px-4 py-3 text-xs">{r.phone_number ?? '—'}</td><td className="px-4 py-3 font-mono text-xs">{r.client_mac}</td><td className="px-4 py-3">{r.sites?.name ?? '—'}<div className="text-xs text-gray-400">{r.controller_name ?? 'Legacy controller'}</div></td><td className="px-4 py-3 font-mono text-xs">{r.ap_mac}</td><td className="px-4 py-3">{r.packages?.name ?? (r.amount_tzs ? `${r.amount_tzs} TZS` : '—')}</td><td className="px-4 py-3 whitespace-nowrap">{fmt(r.authorized_at ?? r.created_at)}</td><td className="px-4 py-3 whitespace-nowrap">{r.expires_at ? fmt(r.expires_at) : '—'}</td><td className="px-4 py-3">{r.record_type === 'AUTHORIZATION' ? badge(r.status as AuthorizationStatus, r.expires_at) : <span className="status-pending">{r.status}</span>}</td><td className="px-4 py-3 text-xs text-red-600">{r.error_message ?? r.reference ?? '—'}</td></tr>)}</tbody></table></div>
    </div>
    <div className="flex items-center justify-end gap-2 text-sm text-gray-500"><button onClick={() => load(page - 1)} disabled={page <= 1} className="btn-secondary py-1 px-3 disabled:opacity-40">Prev</button><span>Page {page}</span><button onClick={() => load(page + 1)} disabled={!hasNextPage} className="btn-secondary py-1 px-3 disabled:opacity-40">Next</button></div>
  </div>
}
