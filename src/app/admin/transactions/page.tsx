'use client'
import { useEffect, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { CURRENCY_FORMAT } from '@/lib/constants'
import type { TransactionStatus } from '@/lib/types'

interface Transaction {
  id: string; reference: string; status: TransactionStatus
  amount_tzs: number; phone_number: string; client_mac: string
  created_at: string; authorized_at: string | null; expires_at: string | null
  sites: { name: string } | null
  packages: { name: string } | null
}

const STATUS_CLASS: Record<string, string> = {
  AUTHORIZED: 'status-success', PAYMENT_SUCCESS: 'status-success',
  PENDING: 'status-pending', PAYMENT_INITIATED: 'status-pending', OMADA_AUTHORIZING: 'status-pending',
  PAYMENT_FAILED: 'status-error', PAYMENT_CANCELLED: 'status-error',
  PAYMENT_TIMEOUT: 'status-error', AUTHORIZATION_FAILED: 'status-error', EXPIRED: 'status-error',
}

export default function TransactionsPage() {
  const [rows, setRows] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20

  const load = async (p = 1) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT), ...(search && { search }) })
      const res = await fetch(`/api/admin/transactions?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) { setRows(data.data); setTotal(data.pagination.total); setPage(p) }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const fmt = (d: string) => new Date(d).toLocaleString('en-TZ', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              className="input-field pl-9 py-2 text-sm w-56"
              placeholder="Reference or phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load(1)}
            />
          </div>
          <button onClick={() => load(1)} className="btn-secondary py-2 px-3 text-sm flex items-center gap-1">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              {['Reference','Site','Package','Phone','Amount','Status','Client MAC','Created','Expires'].map(h => (
                <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="py-8 text-center text-gray-400">No transactions found</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{r.reference}</td>
                <td className="px-4 py-3 text-gray-500">{r.sites?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{r.packages?.name ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.phone_number}</td>
                <td className="px-4 py-3 font-medium">{CURRENCY_FORMAT.format(r.amount_tzs)}</td>
                <td className="px-4 py-3"><span className={STATUS_CLASS[r.status] || 'status-pending'}>{r.status}</span></td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.client_mac}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(r.created_at)}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.expires_at ? fmt(r.expires_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{total} total</span>
        <div className="flex gap-2">
          <button onClick={() => load(page - 1)} disabled={page <= 1} className="btn-secondary py-1 px-3 text-sm disabled:opacity-40">Prev</button>
          <span className="py-1 px-2">Page {page}</span>
          <button onClick={() => load(page + 1)} disabled={page * LIMIT >= total} className="btn-secondary py-1 px-3 text-sm disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  )
}
