'use client'
import { useEffect, useState } from 'react'
import { Trash2, RefreshCw, Ticket, Upload, Eye, AlertCircle } from 'lucide-react'

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

/** Parse Omada voucher CSV export and return only valid, non-expired codes */
function parseOmadaCsv(text: string): { codes: string[]; skipped: number } {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return { codes: [], skipped: 0 }

  // Find Code column index (first column by name)
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())
  const codeIdx = headers.findIndex(h => h.toLowerCase() === 'code')
  const typeIdx = headers.findIndex(h => h.toLowerCase() === 'type')

  if (codeIdx === -1) {
    // Fallback: just take first column
    return { codes: lines.slice(1).map(l => l.split(',')[0].replace(/^"|"$/g, '').trim()).filter(Boolean), skipped: 0 }
  }

  const codes: string[] = []
  let skipped = 0

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    // Parse CSV respecting quoted fields
    const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',')
    const code = (cols[codeIdx] || '').replace(/^"|"$/g, '').trim()
    if (!code) continue

    // Skip expired vouchers
    if (typeIdx !== -1) {
      const type = (cols[typeIdx] || '').replace(/^"|"$/g, '').trim().toLowerCase()
      if (type === 'expired') { skipped++; continue }
    }

    codes.push(code)
  }

  return { codes: [...new Set(codes)], skipped }
}

function fmtDuration(s: number): string {
  if (s >= 86400) return `${s / 86400}d`
  if (s >= 3600)  return `${s / 3600}h`
  return `${Math.round(s / 60)}min`
}

export default function VouchersPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [viewBatch, setViewBatch] = useState<string | null>(null)
  const [vouchers, setVouchers] = useState<any[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  const [form, setForm] = useState({
    site_id: '', name: '', price_tzs: 500, duration_seconds: 21600,
    csvFile: null as File | null, csvPreview: null as { codes: string[]; skipped: number } | null
  })

  const token = () => typeof window !== 'undefined' ? localStorage.getItem('admin_token') || '' : ''

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [bRes, sRes] = await Promise.all([
        fetch('/api/admin/vouchers', { headers: { Authorization: `Bearer ${token()}` } }),
        fetch('/api/admin/sites',    { headers: { Authorization: `Bearer ${token()}` } }),
      ])
      const [bData, sData] = await Promise.all([bRes.json(), sRes.json()])
      if (bData.success) setBatches(bData.data ?? [])
      else setError(bData.error || 'Failed to load batches')
      if (sData.success) setSites(sData.data ?? [])
    } catch { setError('Network error. Please refresh.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleTier = (price: number) => {
    const tier = TIERS.find(t => t.price === price)
    if (tier) setForm(f => ({ ...f, price_tzs: tier.price, duration_seconds: tier.duration }))
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const parsed = parseOmadaCsv(text)
    setForm(f => ({ ...f, csvFile: file, csvPreview: parsed }))
    // Auto-fill batch name from file name
    const autoName = file.name.replace(/\.csv$/i, '').replace(/_/g, ' ')
    setForm(f => ({ ...f, csvFile: file, csvPreview: parsed, name: f.name || autoName }))
  }

  const save = async () => {
    setSaveError('')
    if (!form.name.trim()) { setSaveError('Batch name is required'); return }
    if (!form.csvPreview || form.csvPreview.codes.length === 0) {
      setSaveError('Please upload a valid CSV file with voucher codes'); return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          site_id: form.site_id || null,
          name: form.name.trim(),
          price_tzs: form.price_tzs,
          duration_seconds: form.duration_seconds,
          codes: form.csvPreview.codes
        })
      })
      const data = await res.json()
      if (!data.success) { setSaveError(data.error || 'Upload failed'); return }
      setShowForm(false)
      setForm({ site_id: '', name: '', price_tzs: 500, duration_seconds: 21600, csvFile: null, csvPreview: null })
      load()
    } catch { setSaveError('Connection error') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Delete this batch?\n\nThis only works if no vouchers from this batch have been used.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/vouchers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } })
      const data = await res.json()
      if (!data.success) alert(data.error || 'Delete failed')
      else load()
    } finally { setDeleting(null) }
  }

  const viewVouchers = async (batchId: string) => {
    setViewBatch(batchId); setVouchers([])
    const res = await fetch(`/api/admin/vouchers/${batchId}/list`, { headers: { Authorization: `Bearer ${token()}` } })
    const data = await res.json()
    if (data.success) setVouchers(data.data)
  }

  // Stats by tier
  const tierStats = TIERS.map(t => {
    const tb = batches.filter(b => b.price_tzs === t.price)
    return { ...t, total: tb.reduce((s, b) => s + b.total_count, 0), used: tb.reduce((s, b) => s + b.used_count, 0) }
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vouchers</h1>
          <p className="text-sm text-gray-500 mt-0.5">Upload Omada CSV exports and manage voucher batches</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary py-2 px-3"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowForm(true)} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
            <Upload className="w-4 h-4" /> Upload CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />{error}
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          {tierStats.map(t => (
            <div key={t.price} className="card card-padding">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="w-5 h-5 text-brand-600" />
                <span className="font-semibold text-gray-900 text-sm">TZS {t.price.toLocaleString()}</span>
                <span className="text-gray-400 text-xs">· {fmtDuration(t.duration)}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{t.total - t.used}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t.used} used · {t.total} total</p>
              {t.total > 0 && t.total - t.used < 10 && (
                <p className="text-xs text-red-500 mt-1 font-medium">⚠ Running low!</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Batches table */}
      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : batches.length === 0 ? (
        <div className="card card-padding text-center py-16">
          <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium mb-1">No voucher batches yet</p>
          <p className="text-gray-400 text-sm">Export vouchers from Omada controller and upload the CSV here.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Batch Name', 'Site', 'Price', 'Duration', 'Total', 'Used', 'Remaining', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map(b => {
                const remaining = b.total_count - b.used_count
                return (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                    <td className="px-4 py-3 text-gray-500">{b.sites?.name ?? <span className="italic text-gray-400">All sites</span>}</td>
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">TZS {b.price_tzs.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDuration(b.duration_seconds)}</td>
                    <td className="px-4 py-3 text-gray-600">{b.total_count}</td>
                    <td className="px-4 py-3 text-red-600 font-medium">{b.used_count}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${remaining < 5 ? 'text-red-600' : remaining < 20 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {remaining}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => viewVouchers(b.id)}
                          className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="View codes">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => del(b.id)} disabled={deleting === b.id}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40" title="Delete">
                          {deleting === b.id
                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload CSV Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Upload Voucher Batch</h2>
                <p className="text-sm text-gray-500 mt-0.5">Import CSV exported from Omada Controller</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />{saveError}
                </div>
              )}

              {/* CSV Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Omada Voucher CSV <span className="text-red-500">*</span>
                </label>
                <label className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-colors
                  ${form.csvPreview ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}>
                  <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
                  {form.csvPreview ? (
                    <div className="text-center">
                      <p className="font-semibold text-green-700">{form.csvPreview.codes.length} codes ready</p>
                      {form.csvPreview.skipped > 0 && (
                        <p className="text-xs text-yellow-600 mt-1">{form.csvPreview.skipped} expired vouchers skipped</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">Click to change file</p>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm">Click to upload Omada CSV export</p>
                      <p className="text-xs text-gray-400 mt-1">Expired vouchers are automatically skipped</p>
                    </div>
                  )}
                </label>
              </div>

              {/* Batch name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Batch Name <span className="text-red-500">*</span>
                </label>
                <input className="input-field" placeholder="e.g. August 2026 — 500 TZS"
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              {/* Site */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign to Site</label>
                <select className="input-field" value={form.site_id}
                  onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}>
                  <option value="">All Sites (shared pool)</option>
                  {sites.length === 0
                    ? <option disabled>No sites configured yet</option>
                    : sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                  }
                </select>
                {sites.length === 0 && (
                  <p className="text-xs text-yellow-600 mt-1">⚠ No sites found. Create a site first or leave as "All Sites".</p>
                )}
              </div>

              {/* Price tier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Price Tier <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {TIERS.map(t => (
                    <button key={t.price} type="button" onClick={() => handleTier(t.price)}
                      className={`border-2 rounded-xl p-3 text-center transition-all ${form.price_tzs === t.price
                        ? 'border-brand-500 bg-brand-50 shadow-sm' : 'border-gray-200 hover:border-brand-300'}`}>
                      <p className="font-bold text-gray-900 text-sm">TZS {t.price.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">{fmtDuration(t.duration)}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {form.csvPreview && form.csvPreview.codes.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Preview (first 5 codes)</p>
                  <div className="flex flex-wrap gap-2">
                    {form.csvPreview.codes.slice(0, 5).map(c => (
                      <span key={c} className="font-mono text-sm bg-white border border-gray-200 rounded-lg px-2 py-1">{c}</span>
                    ))}
                    {form.csvPreview.codes.length > 5 && (
                      <span className="text-sm text-gray-400 self-center">+{form.csvPreview.codes.length - 5} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={save} disabled={saving || !form.csvPreview || form.csvPreview.codes.length === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                {saving
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading…</>
                  : <><Upload className="w-4 h-4" /> Upload {form.csvPreview ? `${form.csvPreview.codes.length} Vouchers` : 'Batch'}</>
                }
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary px-5">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* View vouchers modal */}
      {viewBatch && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setViewBatch(null) }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Voucher Codes</h2>
              <button onClick={() => setViewBatch(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              {vouchers.length === 0
                ? <div className="py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>
                : (
                  <div className="space-y-1.5">
                    {vouchers.map((v: any) => (
                      <div key={v.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl ${v.is_used ? 'bg-gray-50' : 'bg-green-50'}`}>
                        <span className="font-mono text-sm font-medium">{v.code}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${v.is_used ? 'bg-gray-200 text-gray-600' : 'bg-green-200 text-green-700'}`}>
                          {v.is_used ? `Used ${v.used_at ? new Date(v.used_at).toLocaleDateString() : ''}` : 'Available'}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">
                {vouchers.filter(v => !v.is_used).length} available · {vouchers.filter(v => v.is_used).length} used
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
