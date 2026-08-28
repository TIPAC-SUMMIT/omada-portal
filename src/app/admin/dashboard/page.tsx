'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, CheckCircle, XCircle, Wifi, Clock, CreditCard, MapPin, Package, RefreshCw } from 'lucide-react'
import { CURRENCY_FORMAT } from '@/lib/constants'

interface Stats {
  totalRevenue: number; successfulPayments: number; failedPayments: number
  pendingPayments: number; authorizationFailures: number
  activeClients: number; expiredSessions: number; todayTransactions: number
  revenueToday: number; paymentSuccessRate: number
  dailySalesCount: number
}
interface SiteStat { siteId: string; siteName: string; revenue: number; transactions: number; activeClients: number }
interface PkgStat  { packageId: string; packageName: string; sales: number; revenue: number }
interface DailyStat { siteId?: string; packageId?: string; siteName?: string; packageName?: string; sales: number; amount: number }

function StatCard({ icon: Icon, label, value, color = 'blue' }: {
  icon: React.ElementType; label: string; value: string | number; color?: string
}) {
  const c: Record<string,string> = {
    blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600', yellow: 'bg-yellow-50 text-yellow-600', purple: 'bg-purple-50 text-purple-600'
  }
  return (
    <div className="card card-padding flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${c[color]}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [siteStats, setSiteStats] = useState<SiteStat[]>([])
  const [pkgStats, setPkgStats] = useState<PkgStat[]>([])
  const [dailySiteStats, setDailySiteStats] = useState<DailyStat[]>([])
  const [dailyPackageStats, setDailyPackageStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const token = localStorage.getItem('admin_token')
      const res = await fetch('/api/admin/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setStats(data.data.stats)
      setSiteStats(data.data.siteStats)
      setPkgStats(data.data.packageStats)
      setDailySiteStats(data.data.dailySiteStats || [])
      setDailyPackageStats(data.data.dailyPackageStats || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-800">{error}</div>
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button onClick={load} className="btn-secondary py-2 px-4 text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={TrendingUp}  label="Total Revenue"        value={CURRENCY_FORMAT.format(stats.totalRevenue)}  color="green"  />
          <StatCard icon={CheckCircle} label="Successful Payments"  value={stats.successfulPayments}                     color="green"  />
          <StatCard icon={XCircle}     label="Failed Payments"      value={stats.failedPayments}                         color="red"    />
          <StatCard icon={Clock}       label="Pending Operations"    value={stats.pendingPayments}                       color="yellow" />
          <StatCard icon={XCircle}     label="Authorization Failures" value={stats.authorizationFailures}               color="red"    />
          <StatCard icon={Wifi}        label="Active Clients"       value={stats.activeClients}                          color="blue"   />
          <StatCard icon={CreditCard}  label="Today's Transactions" value={stats.todayTransactions}                      color="purple" />
          <StatCard icon={TrendingUp}  label="Today's Revenue"      value={CURRENCY_FORMAT.format(stats.revenueToday)}  color="purple" />
          <StatCard icon={CreditCard}  label="Today's Sales"         value={stats.dailySalesCount}                       color="blue" />
          <StatCard icon={Clock}       label="Expired Sessions"     value={stats.expiredSessions}                        color="yellow" />
          <StatCard icon={CheckCircle} label="Success Rate"         value={`${stats.paymentSuccessRate}%`}               color="green"  />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card card-padding">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-brand-600" /> Today by Site
          </h2>
          {dailySiteStats.length === 0 ? <p className="text-gray-400 text-sm">No sales today</p> : dailySiteStats.map(s => (
            <div key={s.siteId} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
              <div><p className="font-medium text-gray-900">{s.siteName}</p><p className="text-xs text-gray-500">{s.sales} sales</p></div>
              <span className="font-semibold">{CURRENCY_FORMAT.format(s.amount)}</span>
            </div>
          ))}
        </div>
        <div className="card card-padding">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-600" /> Today by Package
          </h2>
          {dailyPackageStats.length === 0 ? <p className="text-gray-400 text-sm">No sales today</p> : dailyPackageStats.map(p => (
            <div key={p.packageId} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
              <div><p className="font-medium text-gray-900">{p.packageName}</p><p className="text-xs text-gray-500">{p.sales} sold</p></div>
              <span className="font-semibold">{CURRENCY_FORMAT.format(p.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card card-padding">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-brand-600" /> Revenue by Site
          </h2>
          {siteStats.length === 0 ? <p className="text-gray-400 text-sm">No data yet</p> : siteStats.map(s => (
            <div key={s.siteId} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="font-medium text-gray-900">{s.siteName}</p>
                <p className="text-xs text-gray-500">{s.transactions} txn · {s.activeClients} active</p>
              </div>
              <span className="font-semibold">{CURRENCY_FORMAT.format(s.revenue)}</span>
            </div>
          ))}
        </div>
        <div className="card card-padding">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-600" /> Popular Packages
          </h2>
          {pkgStats.length === 0 ? <p className="text-gray-400 text-sm">No data yet</p> : pkgStats.map(p => (
            <div key={p.packageId} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="font-medium text-gray-900">{p.packageName}</p>
                <p className="text-xs text-gray-500">{p.sales} sales</p>
              </div>
              <span className="font-semibold">{CURRENCY_FORMAT.format(p.revenue)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
