'use client'
import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, Zap, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react'
import type { OmadaController } from '@/lib/types'

interface Controller extends OmadaController {
  site_name?: string
  site_count?: number
  sites?: Array<{ id: string; name: string }>
}

export default function ControllersPage() {
  const [controllers, setControllers] = useState<Controller[]>([])
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Controller | null>(null)
  const [form, setForm] = useState({
    name: '',
    cloud_api_url: '',
    cloud_api_client_id: '',
    cloud_api_client_secret: '',
    cloud_api_omadac_id: '',
    controller_url: '',
    controller_id: '',
    controller_username: '',
    controller_password: '',
    is_active: true,
    site_id: ''
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/controllers', {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setControllers(data.data.controllers || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const loadSites = async () => {
    try {
      const res = await fetch('/api/admin/sites', {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
      })
      const data = await res.json()
      if (data.success) setSites(data.data)
    } catch {
      // Sites remain usable
    }
  }

  useEffect(() => {
    load()
    loadSites()
  }, [])

  const openNew = () => {
    setEditing(null)
    setForm({
      name: '',
      cloud_api_url: '',
      cloud_api_client_id: '',
      cloud_api_client_secret: '',
      cloud_api_omadac_id: '',
      controller_url: '',
      controller_id: '',
      controller_username: '',
      controller_password: '',
      is_active: true,
      site_id: ''
    })
    setShowForm(true)
  }

  const openEdit = (c: Controller) => {
    setEditing(c)
    setForm({
      name: c.name,
      cloud_api_url: c.cloud_api_url || '',
      cloud_api_client_id: c.cloud_api_client_id || '',
      cloud_api_client_secret: '',
      cloud_api_omadac_id: c.cloud_api_omadac_id || '',
      controller_url: c.controller_url || '',
      controller_id: c.controller_id || '',
      controller_username: '',
      controller_password: '',
      is_active: c.is_active,
      site_id: c.site_id || ''
    })
    setShowForm(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const url = editing ? `/api/admin/controllers/${editing.id}` : '/api/admin/controllers'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setShowForm(false)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const del = async (id: string) => {
    if (!confirm('Delete this controller?')) return
    try {
      const res = await fetch(`/api/admin/controllers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const test = async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/admin/controllers/${id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
      })
      const data = await res.json()
      alert(data.data?.message || 'Test completed')
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTesting(null)
    }
  }

  const sync = async (id: string) => {
    setSyncing(id)
    try {
      const res = await fetch(`/api/admin/controllers/${id}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
      })
      const data = await res.json()
      alert(data.data?.message || 'Sync completed')
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(null)
    }

  }

  const importCurrent = async () => {
    setImporting(true)
    try {
      const res = await fetch('/api/admin/controllers/import-legacy', {
        method: 'POST',
        headers: { Authorization: `******'admin_token')}` }
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      alert(`${data.data.message}: ${data.data.site_name}`)
      await load()
      await loadSites()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const statusIcon = (c: Controller) => {
    if (!c.is_active) return <XCircle className="w-4 h-4 text-gray-400" />
    if (c.sync_status === 'error') return <AlertCircle className="w-4 h-4 text-red-500" />
    if (c.sync_status === 'success') return <CheckCircle className="w-4 h-4 text-green-500" />
    return <AlertCircle className="w-4 h-4 text-amber-500" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Controllers</h1>
        <div className="flex gap-2">
          <button onClick={importCurrent} disabled={importing} className="btn-secondary py-2 px-4 text-sm flex items-center gap-2">
            <Download className="w-4 h-4" /> {importing ? 'Importing…' : 'Import current controller'}
          </button>
          <button onClick={openNew} className="btn-primary py-2 px-4 text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Controller
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">{error}</div>}

      {loading ? (
        <div className="flex justify-center h-32">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400 self-center" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-4 py-3 font-medium">Cloud API</th>
                <th className="px-4 py-3 font-medium">Controller API</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Sync</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {controllers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No controllers configured
                  </td>
                </tr>
              ) : (
                controllers.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-500">
                      <div>{c.site_count ?? c.sites?.length ?? 0} site{(c.site_count ?? c.sites?.length ?? 0) === 1 ? '' : 's'}</div>
                      {c.site_count === 1 && c.sites?.[0] && <div className="text-xs text-gray-400">{c.sites[0].name}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {c.cloud_api_url ? (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">Configured</span>
                      ) : (
                        <span className="text-xs bg-gray-50 text-gray-500 px-2 py-1 rounded">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.controller_url ? (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">Configured</span>
                      ) : (
                        <span className="text-xs bg-gray-50 text-gray-500 px-2 py-1 rounded">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      {statusIcon(c)}
                      <span className="text-xs">
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {c.synced_at ? new Date(c.synced_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        onClick={() => test(c.id)}
                        disabled={testing === c.id}
                        title="Test connections"
                        className="text-amber-600 hover:text-amber-800 disabled:opacity-50"
                      >
                        <Zap className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => sync(c.id)}
                        disabled={syncing === c.id}
                        title="Sync sites"
                        className="text-green-600 hover:text-green-800 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing === c.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => openEdit(c)}
                        title="Edit"
                        className="text-brand-600 hover:text-brand-800"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => del(c.id)}
                        title="Delete"
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 space-y-4 my-8">
            <h2 className="text-lg font-bold">{editing ? 'Edit Controller' : 'Add Controller'}</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default site (optional)</label>
              <select
                className="input-field"
                value={form.site_id}
                onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}
              >
                <option value="">No default site — sync all Omada sites</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Controller Name *</label>
              <input
                className="input-field"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Main Controller, Backup Controller"
              />
            </div>

            <div className="space-y-3 pt-2 border-t">
              <h3 className="font-medium text-sm text-gray-900">Cloud Open API (Northbound)</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API URL</label>
                <input
                  className="input-field"
                  value={form.cloud_api_url}
                  onChange={e => setForm(f => ({ ...f, cloud_api_url: e.target.value }))}
                  placeholder="https://api.ubic.eset.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                  <input
                    className="input-field"
                    value={form.cloud_api_client_id}
                    onChange={e => setForm(f => ({ ...f, cloud_api_client_id: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Omada Controller ID</label>
                  <input
                    className="input-field"
                    value={form.cloud_api_omadac_id}
                    onChange={e => setForm(f => ({ ...f, cloud_api_omadac_id: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret {editing && '(leave empty to keep current)'}</label>
                <input
                  type="password"
                  className="input-field"
                  value={form.cloud_api_client_secret}
                  onChange={e => setForm(f => ({ ...f, cloud_api_client_secret: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <h3 className="font-medium text-sm text-gray-900">Hotspot Operator API (Controller)</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Controller URL</label>
                <input
                  className="input-field"
                  value={form.controller_url}
                  onChange={e => setForm(f => ({ ...f, controller_url: e.target.value }))}
                  placeholder="https://192.168.1.1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Controller ID</label>
                <input
                  className="input-field"
                  value={form.controller_id}
                  onChange={e => setForm(f => ({ ...f, controller_id: e.target.value }))}
                  placeholder="Default_Controller"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Operator Username {editing && '(leave empty to keep current)'}</label>
                  <input
                    className="input-field"
                    value={form.controller_username}
                    onChange={e => setForm(f => ({ ...f, controller_username: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Operator Password {editing && '(leave empty to keep current)'}</label>
                  <input
                    type="password"
                    className="input-field"
                    value={form.controller_password}
                    onChange={e => setForm(f => ({ ...f, controller_password: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
