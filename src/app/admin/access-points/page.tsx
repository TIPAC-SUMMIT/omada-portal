'use client'

import { useEffect, useState } from 'react'
import { Pencil, Plus, Radio, RefreshCw, Trash2 } from 'lucide-react'

interface Item { id: string; site_id: string; controller_id: string | null; ap_mac: string; name: string | null; model: string | null; is_active: boolean; sites?: { name: string } | null; omada_controllers?: { name: string } | null }
interface Option { id: string; name: string }

export default function AccessPointsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [sites, setSites] = useState<Option[]>([])
  const [controllers, setControllers] = useState<Option[]>([])
  const [form, setForm] = useState({ id: '', site_id: '', controller_id: '', ap_mac: '', name: '', model: '' })
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const token = () => `Bearer ${localStorage.getItem('admin_token')}`

  const load = async () => {
    setLoading(true)
    try {
      const [aps, siteResponse, controllerResponse] = await Promise.all([
        fetch('/api/admin/access-points', { headers: { Authorization: token() } }),
        fetch('/api/admin/sites', { headers: { Authorization: token() } }),
        fetch('/api/admin/controllers', { headers: { Authorization: token() } }),
      ])
      const apData = await aps.json()
      const siteData = await siteResponse.json()
      const controllerData = await controllerResponse.json()
      if (apData.success) setItems(apData.data)
      if (siteData.success) setSites(siteData.data)
      if (controllerData.success) setControllers(controllerData.data.controllers ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  const reset = () => setForm({ id: '', site_id: '', controller_id: '', ap_mac: '', name: '', model: '' })
  const edit = (item: Item) => {
    setForm({ id: item.id, site_id: item.site_id, controller_id: item.controller_id ?? '', ap_mac: item.ap_mac, name: item.name ?? '', model: item.model ?? '' })
    setShowForm(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch(form.id ? `/api/admin/access-points/${form.id}` : '/api/admin/access-points', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token() },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.error)
      setShowForm(false)
      reset()
      await load()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save access point')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this EAP mapping?')) return
    await fetch(`/api/admin/access-points/${id}`, { method: 'DELETE', headers: { Authorization: token() } })
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-gray-900">EAP / Access Points</h1><p className="text-sm text-gray-500 mt-1">Map each EAP MAC address to its controller and site for portal routing.</p></div>
        <button onClick={() => { reset(); setShowForm(true) }} className="btn-primary py-2 px-4 text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add EAP</button>
      </div>
      <div className="card overflow-x-auto">
        {loading ? <div className="p-10 flex justify-center"><RefreshCw className="animate-spin text-gray-400" /></div> : (
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 text-gray-600 text-left"><tr>{['EAP','Name / Model','Site','Controller','Status','Actions'].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{item.ap_mac}</td>
                <td className="px-4 py-3">{item.name ?? '—'}{item.model && <div className="text-xs text-gray-400">{item.model}</div>}</td>
                <td className="px-4 py-3 text-gray-500">{item.sites?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{item.omada_controllers?.name ?? '—'}</td>
                <td className="px-4 py-3">{item.is_active ? <span className="status-success">Active</span> : <span className="status-error">Inactive</span>}</td>
                <td className="px-4 py-3 flex gap-3"><button onClick={() => edit(item)} className="text-brand-600"><Pencil className="w-4 h-4" /></button><button onClick={() => remove(item.id)} className="text-red-500"><Trash2 className="w-4 h-4" /></button></td>
              </tr>)}
              {!items.length && <tr><td colSpan={6} className="p-8 text-center text-gray-400">No EAP mappings yet</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {showForm && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center gap-2"><Radio className="w-5 h-5 text-brand-600" /><h2 className="text-lg font-bold">{form.id ? 'Edit EAP mapping' : 'Add EAP mapping'}</h2></div>
        <select className="input-field" value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}><option value="">Select site</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="input-field" value={form.controller_id} onChange={e => setForm(f => ({ ...f, controller_id: e.target.value }))}><option value="">Select controller</option>{controllers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input className="input-field" placeholder="EAP MAC, e.g. 98:BA:5F:1C:D7:9C" value={form.ap_mac} onChange={e => setForm(f => ({ ...f, ap_mac: e.target.value }))} disabled={!!form.id} />
        <input className="input-field" placeholder="EAP name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input className="input-field" placeholder="Model (optional)" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
        <div className="flex gap-3"><button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save mapping'}</button><button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button></div>
      </div></div>}
    </div>
  )
}
