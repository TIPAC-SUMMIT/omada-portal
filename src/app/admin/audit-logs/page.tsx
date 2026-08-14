'use client'
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { AuditLog } from '@/lib/types'

export default function AuditLogsPage() {
  const [rows, setRows] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 25

  const load = async (p = 1) => {
    setLoading(true)
    try {
      const token = localStorage.getItem('admin_token')
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      const res = await fetch(`/api/admin/audit-logs?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) { setRows(data.data); setTotal(data.pagination.total); setPage(p) }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const fmt = (d: string) => new Date(d).toLocaleString('en-TZ', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <button onClick={() => load(1)} className="btn-secondary py-2 px-4 text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              {['Time','Action','Admin','Site','Details'].map(h => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">No audit logs yet</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(r.created_at)}</td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{r.action}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{(r as any).admins?.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{(r as any).sites?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-400 text-xs font-mono max-w-xs truncate">
                  {r.details ? JSON.stringify(r.details) : '—'}
                </td>
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
