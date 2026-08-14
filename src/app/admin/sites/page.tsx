'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, MapPin, CheckCircle, XCircle } from 'lucide-react'
import type { Site } from '@/lib/types'

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Site | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', location: '', description: '', status: 'ACTIVE' as Site['status'] })
  const [saving, setSaving] = useState(false)

  const token = () => localStorage.getItem('admin_token')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sites', { headers: { Authorization: `Bearer ${token()}` } })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setSites(data.data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm({ name: '', slug: '', location: '', description: '', status: 'ACTIVE' }); setShowForm(true) }
  const openEdit = (s: Site) => { setEditing(s); setForm({ name: s.name, slug: s.slug, location: s.location ?? '', description: s.description ?? '', status: s.status }); setShowForm(true) }

  const save = async () => {
    setSaving(true)
    try {
      const url = editing ? `/api/admin/sites/${editing.id}` : '/api/admin/sites'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setShowForm(false); load()
    } catch (e) { alert(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const del = async (id: string) => {
    if (!confirm('Delete this site?')) return
    await fetch(`/api/admin/sites/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } })
    load()
  }

  const statusBadge = (s: Site['status']) => {
    const map: Record<string, string> = { ACTIVE: 'status-success', INACTIVE: 'status-error', MAINTENANCE: 'status-pending' }
    return <span className={map[s] || 'status-pending'}>{s}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
        <button onClick={openNew} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Site
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error}</div>}

      {loading ? (
        <div className="flex justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin text-gray-400 self-center" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sites.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No sites yet</td></tr>
              ) : sites.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.slug}</td>
                  <td className="px-4 py-3 text-gray-500">{s.location ?? '—'}</td>
                  <td className="px-4 py-3">{statusBadge(s.status)}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => openEdit(s)} className="text-brand-600 hover:text-brand-800"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => del(s.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-bold">{editing ? 'Edit Site' : 'Add Site'}</h2>
            {['name', 'slug', 'location', 'description'].map(field => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{field}</label>
                <input
                  className="input-field"
                  value={(form as any)[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="input-field" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}>
                <option>ACTIVE</option><option>INACTIVE</option><option>MAINTENANCE</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
