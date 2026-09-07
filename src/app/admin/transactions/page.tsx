'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { CURRENCY_FORMAT } from '@/lib/constants'
import type { TransactionStatus, Site } from '@/lib/types'

interface Transaction {
  id: string; reference: string; status: TransactionStatus; amount_tzs: number; phone_number: string; client_mac: string
  created_at: string; authorized_at: string | null; expires_at: string | null; malipopay_transaction_id: string | null
  voucher_code: string | null; error_code: string | null; error_message: string | null; controller_id: string | null
  controller_name: string | null; ap_mac_resolved: string | null; ap_name: string | null; ap_model: string | null
  omada_site_id_resolved: string | null; omada_account_id: string | null; omada_controllers: { name: string } | null
  sites: { name: string } | null; packages: { name: string } | null
}

const STATUS_CLASS: Record<string, string> = {
  AUTHORIZED: 'status-success', PAYMENT_SUCCESS: 'status-success', PENDING: 'status-pending',
  PAYMENT_INITIATED: 'status-pending', OMADA_AUTHORIZING: 'status-pending', PAYMENT_FAILED: 'status-error',
  PAYMENT_CANCELLED: 'status-error', PAYMENT_TIMEOUT: 'status-error', AUTHORIZATION_FAILED: 'status-error', EXPIRED: 'status-error',
}

export default function TransactionsPage() {
  const [rows, setRows] = useState<Transaction[]>([]), [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), [total, setTotal] = useState(0)
  const [sites, setSites] = useState<Site[]>([]), [controllers, setControllers] = useState<Array<{ id: string; name: string }>>([])
  const [accessPoints, setAccessPoints] = useState<Array<{ id: string; name: string | null; ap_mac: string }>>([])
  const [siteId, setSiteId] = useState(''), [controllerId, setControllerId] = useState(''), [accessPointId, setAccessPointId] = useState(''), [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Transaction | null>(null), [retrying, setRetrying] = useState(false)
  const LIMIT = 20
  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_token') ?? ''}` })
  const filters = (overrides: Partial<{ siteId: string; controllerId: string; accessPointId: string; status: string; search: string }> = {}) => ({
    siteId, controllerId, accessPointId, status, search, ...overrides
  })

  const load = async (p = 1, f = filters()) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (f.search) params.set('search', f.search)
      if (f.siteId) params.set('site_id', f.siteId)
      if (f.controllerId) params.set('controller_id', f.controllerId)
      if (f.accessPointId) params.set('access_point_id', f.accessPointId)
      if (f.status) params.set('status', f.status)
      const data = await (await fetch(`/api/admin/transactions?${params}`, { headers: authHeaders() })).json()
      if (data.success) { setRows(data.data); setTotal(data.pagination.total); setPage(p) }
    } finally { setLoading(false) }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/sites', { headers: authHeaders() }).then(r => r.json()),
      fetch('/api/admin/controllers', { headers: authHeaders() }).then(r => r.json()),
      fetch('/api/admin/access-points', { headers: authHeaders() }).then(r => r.json())
    ]).then(([s, c, a]) => {
      if (s.success) setSites(s.data); if (c.success) setControllers(c.data.controllers ?? []); if (a.success) setAccessPoints(a.data)
    }).catch(() => {})
    load()
  }, [])

  const fmt = (d: string) => new Date(d).toLocaleString('en-TZ', { dateStyle: 'short', timeStyle: 'short' })
  const openDetails = async (row: Transaction) => {
    const data = await (await fetch(`/api/admin/transactions/${row.id}`, { headers: authHeaders() })).json()
    if (data.success) setSelected(data.data)
  }
  const retryAuthorization = async () => {
    if (!selected) return
    setRetrying(true)
    try {
      const data = await (await fetch(`/api/admin/transactions/${selected.id}`, { method: 'POST', headers: authHeaders() })).json()
      if (!data.success) throw new Error(data.error)
      setSelected(null); load(page)
    } catch (error) { alert(error instanceof Error ? error.message : 'Retry failed') } finally { setRetrying(false) }
  }
  const change = (key: 'siteId' | 'controllerId' | 'accessPointId' | 'status', value: string) => {
    const f = filters({ [key]: value }); if (key === 'siteId') setSiteId(value); if (key === 'controllerId') setControllerId(value); if (key === 'accessPointId') setAccessPointId(value); if (key === 'status') setStatus(value); load(1, f)
  }

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
      <div className="grid grid-cols-2 sm:flex gap-2 w-full lg:w-auto">
        <div className="relative col-span-2"><Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" /><input className="input-field pl-9 py-2 text-sm w-full lg:w-56" placeholder="Reference or phone…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1, filters({ search: e.currentTarget.value }))} /></div>
        <select className="input-field py-2 text-sm" value={siteId} onChange={e => change('siteId', e.target.value)}><option value="">All sites</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="input-field py-2 text-sm" value={controllerId} onChange={e => change('controllerId', e.target.value)}><option value="">All controllers</option>{controllers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input-field py-2 text-sm" value={accessPointId} onChange={e => change('accessPointId', e.target.value)}><option value="">All EAPs</option>{accessPoints.map(a => <option key={a.id} value={a.id}>{a.name || a.ap_mac}</option>)}</select>
        <select className="input-field py-2 text-sm" value={status} onChange={e => change('status', e.target.value)}><option value="">All statuses</option>{Object.keys(STATUS_CLASS).map(s => <option key={s}>{s}</option>)}</select>
        <button onClick={() => load(1)} className="btn-secondary py-2 px-3 text-sm flex items-center justify-center"><RefreshCw className="w-4 h-4" /></button>
      </div>
    </div>
    <div className="card overflow-hidden">
      <div className="divide-y divide-gray-100 md:hidden">{loading ? <div className="p-8 text-center"><RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div> : rows.length === 0 ? <div className="p-8 text-center text-gray-400">No transactions found</div> : rows.map(r => <button key={r.id} className="block w-full text-left p-4 space-y-2 hover:bg-gray-50" onClick={() => openDetails(r)}><div className="flex justify-between gap-3"><span className="font-mono text-xs">{r.reference}</span><span className={STATUS_CLASS[r.status] || 'status-pending'}>{r.status}</span></div><div className="font-medium">{r.sites?.name ?? '—'} · {r.controller_name ?? r.omada_controllers?.name ?? 'Legacy controller'}</div><div className="text-xs text-gray-500">{r.ap_name ?? r.ap_mac_resolved ?? r.client_mac} · {r.packages?.name ?? '—'}</div><div className="flex justify-between text-sm"><span>{r.phone_number}</span><span className="font-medium">{CURRENCY_FORMAT.format(r.amount_tzs)}</span></div></button>)}</div>
      <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm min-w-[800px]"><thead className="bg-gray-50 text-gray-600 text-left"><tr>{['Reference','Site / Controller','EAP / AP','Package','Phone','Amount','Status','Created','Expires','Details'].map(h => <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{loading ? <tr><td colSpan={10} className="py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></td></tr> : rows.length === 0 ? <tr><td colSpan={10} className="py-8 text-center text-gray-400">No transactions found</td></tr> : rows.map(r => <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetails(r)}><td className="px-4 py-3 font-mono text-xs">{r.reference}</td><td className="px-4 py-3 text-gray-500">{r.sites?.name ?? '—'}<div className="text-xs text-gray-400">{r.controller_name ?? r.omada_controllers?.name ?? 'Legacy controller'}</div></td><td className="px-4 py-3 text-gray-500">{r.ap_name ?? r.ap_mac_resolved ?? r.client_mac}<div className="text-xs text-gray-400">{r.ap_model}</div></td><td className="px-4 py-3 text-gray-500">{r.packages?.name ?? '—'}</td><td className="px-4 py-3 font-mono text-xs">{r.phone_number}</td><td className="px-4 py-3 font-medium">{CURRENCY_FORMAT.format(r.amount_tzs)}</td><td className="px-4 py-3"><span className={STATUS_CLASS[r.status] || 'status-pending'}>{r.status}</span></td><td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(r.created_at)}</td><td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.expires_at ? fmt(r.expires_at) : '—'}</td><td className="px-4 py-3 text-xs">{r.error_message ?? r.malipopay_transaction_id ?? '—'}</td></tr>)}</tbody></table></div>
    </div>
    {selected && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}><div className="bg-white rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}><div className="flex justify-between items-start"><h2 className="text-lg font-bold">Transaction details</h2><button onClick={() => setSelected(null)} className="text-gray-500">Close</button></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"><div><span className="text-gray-500">Reference</span><p className="font-mono">{selected.reference}</p></div><div><span className="text-gray-500">Status</span><p>{selected.status}</p></div><div><span className="text-gray-500">Amount</span><p>{CURRENCY_FORMAT.format(selected.amount_tzs)}</p></div><div><span className="text-gray-500">Package</span><p>{selected.packages?.name ?? '—'}</p></div><div><span className="text-gray-500">Controller</span><p>{selected.controller_name ?? selected.omada_controllers?.name ?? 'Legacy controller'}</p></div><div><span className="text-gray-500">EAP / AP</span><p>{selected.ap_name ?? selected.ap_mac_resolved ?? '—'}</p></div><div><span className="text-gray-500">Omada site</span><p className="font-mono text-xs">{selected.omada_site_id_resolved ?? '—'}</p></div><div><span className="text-gray-500">Provider reference</span><p className="font-mono text-xs">{selected.malipopay_transaction_id ?? '—'}</p></div><div className="sm:col-span-2"><span className="text-gray-500">Error</span><p className="text-red-600">{selected.error_message ?? '—'}</p></div></div>{['PAYMENT_SUCCESS', 'OMADA_AUTHORIZING', 'AUTHORIZATION_FAILED'].includes(selected.status) && <button onClick={retryAuthorization} disabled={retrying} className="btn-primary w-full">{retrying ? 'Authorizing…' : 'Retry Omada authorization'}</button>}</div></div>}
    <div className="flex items-center justify-between text-sm text-gray-500"><span>{total} total</span><div className="flex gap-2"><button onClick={() => load(page - 1)} disabled={page <= 1} className="btn-secondary py-1 px-3 text-sm disabled:opacity-40">Prev</button><span className="py-1 px-2">Page {page} of {Math.max(1, Math.ceil(total / LIMIT))}</span><button onClick={() => load(page + 1)} disabled={page * LIMIT >= total} className="btn-secondary py-1 px-3 text-sm disabled:opacity-40">Next</button></div></div>
  </div>
}
