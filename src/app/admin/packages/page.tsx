'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, Clock, Package } from 'lucide-react'
import { CURRENCY_FORMAT } from '@/lib/constants'
import type { Package as PkgType } from '@/lib/types'

// ── Duration helpers ──────────────────────────────────────────────────────────
type Unit = 'minutes' | 'hours' | 'days'

function secondsToUnit(seconds: number): { value: number; unit: Unit } {
  if (seconds % 86400 === 0) return { value: seconds / 86400, unit: 'days' }
  if (seconds % 3600 === 0)  return { value: seconds / 3600,  unit: 'hours' }
  return { value: Math.round(seconds / 60), unit: 'minutes' }
}

function unitToSeconds(value: number, unit: Unit): number {
  if (unit === 'days')    return value * 86400
  if (unit === 'hours')   return value * 3600
  return value * 60
}

function fmtDuration(s: number): string {
  if (s >= 86400 && s % 86400 === 0) { const d = s/86400; return `${d} day${d>1?'s':''}` }
  if (s >= 3600  && s % 3600  === 0) { const h = s/3600;  return `${h} hour${h>1?'s':''}` }
  const m = Math.round(s/60); return `${m} min${m>1?'s':''}`
}

// ── Default form state ─────────────────────────────────────────────────────────
const blank = { name: '', description: '', durationValue: 1, durationUnit: 'hours' as Unit, price_tzs: 1000, sort_order: 0, status: 'ACTIVE' as PkgType['status'] }

export default function PackagesPage() {
  const [packages, setPackages] = useState<PkgType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PkgType | null>(null)
  const [form, setForm] = useState({ ...blank })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const token = () => typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''

  const load = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/packages', { headers: { Authorization: `Bearer ${token()}` } })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setPackages(data.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setForm({ ...blank })
    setSaveError('')
    setShowForm(true)
  }

  const openEdit = (p: PkgType) => {
    setEditing(p)
    const { value, unit } = secondsToUnit(p.duration_seconds)
    setForm({ name: p.name, description: p.description ?? '', durationValue: value, durationUnit: unit, price_tzs: p.price_tzs, sort_order: p.sort_order, status: p.status })
    setSaveError('')
    setShowForm(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setSaveError('Name is required'); return }
    if (form.price_tzs < 100) { setSaveError('Price must be at least TZS 100'); return }
    if (form.durationValue < 1) { setSaveError('Duration must be at least 1'); return }

    setSaving(true); setSaveError('')
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        duration_seconds: unitToSeconds(form.durationValue, form.durationUnit),
        price_tzs: form.price_tzs,
        sort_order: form.sort_order,
        status: form.status
      }
      const url = editing ? `/api/admin/packages/${editing.id}` : '/api/admin/packages'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setShowForm(false)
      load()
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?\n\nIf this package has transactions it will be marked inactive instead of deleted.`)) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/packages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      load()
    } catch (e) { alert(e instanceof Error ? e.message : 'Delete failed') }
    finally { setDeleting(null) }
  }

  const badge = (s: string) => {
    const map: Record<string, string> = { ACTIVE: 'bg-green-100 text-green-700', INACTIVE: 'bg-yellow-100 text-yellow-700', DELETED: 'bg-red-100 text-red-700' }
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[s] || 'bg-gray-100 text-gray-600'}`}>{s}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Packages</h1>
          <p className="text-sm text-gray-500 mt-0.5">{packages.length} package{packages.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary py-2 px-3 text-sm flex items-center gap-1">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={openNew} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Package
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : packages.length === 0 ? (
        <div className="card card-padding text-center py-16">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No packages yet. Add your first package.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Name','Duration','Price (TZS)','Sort','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {packages.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Clock className="w-3.5 h-3.5" />
                      {fmtDuration(p.duration_seconds)}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">
                    {p.price_tzs.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{p.sort_order}</td>
                  <td className="px-4 py-3">{badge(p.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(p)}
                        className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        title="Edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => del(p.id, p.name)}
                        disabled={deleting === p.id}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        title="Delete">
                        {deleting === p.id
                          ? <RefreshCw className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal Form ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editing ? 'Edit Package' : 'New Package'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
              {saveError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{saveError}</div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Name <span className="text-red-500">*</span></label>
                <input className="input-field" placeholder="e.g. 1 Hour" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className="input-field" placeholder="e.g. One hour of high-speed internet" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              {/* Duration with unit selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duration <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  <div className="w-28">
                    <input type="number" min="1" className="input-field text-center"
                      value={form.durationValue}
                      onChange={e => setForm(f => ({ ...f, durationValue: Math.max(1, parseInt(e.target.value) || 1) }))} />
                  </div>
                  <div className="flex-1">
                    <select className="input-field" value={form.durationUnit}
                      onChange={e => setForm(f => ({ ...f, durationUnit: e.target.value as Unit }))}>
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1.5 bg-gray-50 rounded px-2 py-1">
                  ⏱ {fmtDuration(unitToSeconds(form.durationValue, form.durationUnit))} = {unitToSeconds(form.durationValue, form.durationUnit).toLocaleString()} seconds
                </p>
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price <span className="text-red-500">*</span></label>
                <div className="flex items-center border-2 border-gray-200 rounded-xl focus-within:border-brand-500 transition-colors overflow-hidden">
                  <span className="px-3 py-3 bg-gray-50 text-gray-500 text-sm font-medium border-r border-gray-200 shrink-0">TZS</span>
                  <input type="number" min="100" step="100"
                    className="flex-1 px-3 py-3 focus:outline-none text-gray-900"
                    value={form.price_tzs}
                    onChange={e => setForm(f => ({ ...f, price_tzs: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                <input type="number" min="0" className="input-field"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
                <p className="text-xs text-gray-400 mt-1">Lower numbers appear first</p>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select className="input-field" value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as PkgType['status'] }))}>
                  <option value="ACTIVE">Active — visible to guests</option>
                  <option value="INACTIVE">Inactive — hidden from guests</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={save} disabled={saving}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : editing ? 'Save Changes' : 'Create Package'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary px-5">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
