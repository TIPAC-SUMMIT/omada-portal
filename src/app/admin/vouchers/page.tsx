'use client'
import { useEffect, useState } from 'react'
import { Plus, Trash2, RefreshCw, Ticket, Upload, Eye } from 'lucide-react'

interface Batch {
  id: string; name: string; price_tzs: number; duration_seconds: number
  total_count: number; used_count: number; created_at: string
  sites: { name: string } | null
}

const TIERS = [
  { price: 200,  duration: 420,   label: '200 TZS — 7 Minutes' },
  { price: 500,  duration: 21600, label: '500 TZS — 6 Hours'   },
  { price: 1000, duration: 86400, label: '1,000 TZS — 24 Hours' },
]

export default function VouchersPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [sites, setSites] = useState<{id:string;name:string}[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [viewBatch, setViewBatch] = useState<string|null>(null)
  const [vouchers, setVouchers] = useState<any[]>([])

  const [form, setForm] = useState({
    site_id: '', name: '', price_tzs: 200, duration_seconds: 420, codes: ''
  })

  const token = () => localStorage.getItem('admin_token') || ''

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [bRes, sRes] = await Promise.all([
        fetch('/api/admin/vouchers',         { headers: { Authorization: `Bearer ${token()}` } }),
        fetch('/api/admin/sites',            { headers: { Authorization: `Bearer ${token()}` } }),
      ])
      const [bData, sData] = await Promise.all([bRes.json(), sRes.json()])
      if (bData.success) setBatches(bData.data)
      if (sData.success) setSites(sData.data)
    } catch { setError('Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleTier = (price: number) => {
    const tier = TIERS.find(t => t.price === price)
    if (tier) setForm(f => ({ ...f, price_tzs: tier.price, duration_seconds: tier.duration }))
  }

  const save = async () => {
    setSaveError('')
    const codes = form.codes.split(/[\n,]+/).map(c => c.trim()).filter(Boolean)
    if (!form.name.trim()) { setSaveError('Batch name is required'); return }
    if (codes.length === 0) { setSaveError('Paste at least one voucher code'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...form, codes })
      })
      const data = await res.json()
      if (!data.success) { setSaveError(data.error || 'Save failed'); return }
      setShowForm(false)
      setForm({ site_id: '', name: '', price_tzs: 200, duration_seconds: 420, codes: '' })
      load()
    } catch { setSaveError('Connection error') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Delete this batch? Only works if no vouchers have been used.')) return
    const res = await fetch(`/api/admin/vouchers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } })
    const data = await res.json()
    if (!data.success) alert(data.error)
    else load()
  }

  const viewVouchers = async (batchId: string) => {
    setViewBatch(batchId)
    const res = await fetch(`/api/admin/vouchers/${batchId}/list`, { headers: { Authorization: `Bearer ${token()}` } })
    const data = await res.json()
    if (data.success) setVouchers(data.data)
  }

  const fmtDuration = (s: number) => {
    if (s >= 86400) return `${s/86400}d`
    if (s >= 3600)  return `${s/3600}h`
    return `${Math.round(s/60)}min`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vouchers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upload and manage voucher codes from Omada</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary py-2 px-3"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowForm(true)} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
            <Upload className="w-4 h-4" /> Upload Vouchers
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}

      {/* Stats cards */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          {TIERS.map(t => {
            const tierBatches = batches.filter(b => b.price_tzs === t.price)
            const total = tierBatches.reduce((s, b) => s + b.total_count, 0)
            const used  = tierBatches.reduce((s, b) => s + b.used_count, 0)
            return (
              <div key={t.price} className="card card-padding">
                <div className="flex items-center gap-3 mb-2">
                  <Ticket className="w-5 h-5 text-brand-600" />
                  <span className="font-semibold text-gray-900">TZS {t.price.toLocaleString()}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{total - used}</p>
                <p className="text-xs text-gray-500">available of {total} total · {used} used</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Batches table */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : batches.length === 0 ? (
        <div className="card card-padding text-center py-16">
          <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No voucher batches yet. Upload your first batch.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Batch Name','Site','Price','Duration','Total','Used','Remaining','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                  <td className="px-4 py-3 text-gray-500">{b.sites?.name ?? 'All Sites'}</td>
                  <td className="px-4 py-3 font-mono font-medium">TZS {b.price_tzs.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDuration(b.duration_seconds)}</td>
                  <td className="px-4 py-3 text-gray-700">{b.total_count}</td>
                  <td className="px-4 py-3 text-red-600">{b.used_count}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${b.total_count - b.used_count < 5 ? 'text-red-600' : 'text-green-600'}`}>
                      {b.total_count - b.used_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => viewVouchers(b.id)} className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg" title="View codes">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => del(b.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Upload Voucher Batch</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {saveError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{saveError}</div>}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batch Name <span className="text-red-500">*</span></label>
                <input className="input-field" placeholder="e.g. August 2026 - 200 TZS"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Site</label>
                <select className="input-field" value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
                  <option value="">All Sites</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price Tier <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {TIERS.map(t => (
                    <button key={t.price} type="button"
                      onClick={() => handleTier(t.price)}
                      className={`border-2 rounded-xl p-3 text-center transition-all ${form.price_tzs === t.price ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}>
                      <p className="font-bold text-gray-900">TZS {t.price.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{fmtDuration(t.duration)}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Voucher Codes <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">(paste from Omada, one per line or comma separated)</span>
                </label>
                <textarea rows={8} className="input-field font-mono text-sm resize-none"
                  placeholder={"ABC123\nDEF456\nGHI789"}
                  value={form.codes} onChange={e => setForm(f => ({ ...f, codes: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">
                  {form.codes.split(/[\n,]+/).filter(c => c.trim()).length} codes detected
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={save} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading…</> : <><Upload className="w-4 h-4" /> Upload Batch</>}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary px-5">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* View vouchers modal */}
      {viewBatch && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setViewBatch(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Voucher Codes</h2>
              <button onClick={() => setViewBatch(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              <div className="space-y-2">
                {vouchers.map((v: any) => (
                  <div key={v.id} className={`flex items-center justify-between p-2 rounded-lg ${v.is_used ? 'bg-gray-50' : 'bg-green-50'}`}>
                    <span className="font-mono text-sm">{v.code}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${v.is_used ? 'bg-gray-200 text-gray-600' : 'bg-green-200 text-green-700'}`}>
                      {v.is_used ? 'Used' : 'Available'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
