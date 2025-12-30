import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

interface CacheRules {
  finnhub: {
    quote: number
    candles: number
    profile: number
    financials: number
    search: number
    news: number
  }
  polygon: {
    tickers: number
    tickerDetails: number
  }
  yahoo: {
    history: number
    historyArchive: number
    quote: number
  }
  sec: {
    filings: number
  }
  default: number
}

interface CacheStats {
  finnhub: { count: number; size: number }
  polygon: { count: number; size: number }
  yahoo: { count: number; size: number }
  sec: { count: number; size: number }
  other: { count: number; size: number }
}

const DURATION_OPTIONS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '1h', value: 3600 },
  { label: '12h', value: 43200 },
  { label: '1d', value: 86400 },
  { label: '1w', value: 604800 },
]

const COLORS = ['#333', '#555', '#777', '#999', '#bbb']

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function DurationSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const isPreset = DURATION_OPTIONS.some(opt => opt.value === value)

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {DURATION_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            border: '1px solid #ddd',
            borderRadius: 4,
            background: value === opt.value ? '#000' : '#fff',
            color: value === opt.value ? '#fff' : '#666',
            cursor: 'pointer',
            fontWeight: value === opt.value ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          fontSize: 12,
          border: '1px solid #ddd',
          borderRadius: 4,
          background: !isPreset ? '#000' : '#fff',
          color: !isPreset ? '#fff' : '#666',
          gap: 4,
        }}
      >
        <span style={{ fontWeight: !isPreset ? 600 : 400 }}>sec:</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder=""
          value={isPreset ? '' : value}
          onChange={(e) => {
            const num = parseInt(e.target.value.replace(/\D/g, '')) || 1
            onChange(num)
          }}
          style={{
            width: 44,
            height: 18,
            border: '1px solid',
            borderColor: !isPreset ? 'rgba(255,255,255,0.3)' : '#ddd',
            borderRadius: 2,
            padding: '0 4px',
            background: 'transparent',
            color: 'inherit',
            fontSize: 11,
            fontWeight: !isPreset ? 600 : 400,
            outline: 'none',
            textAlign: 'right',
          }}
        />
      </div>
    </div>
  )
}

function RedisRules() {
  const { getToken } = useAuth()
  const [rules, setRules] = useState<CacheRules | null>(null)
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const token = await getToken()
      const [rulesRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/cache-rules`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/api/admin/cache-stats`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])

      if (rulesRes.ok) {
        const rulesData = await rulesRes.json()
        setRules(rulesData)
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData)
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setMessage({ type: 'error', text: 'Failed to load cache data' })
    } finally {
      setLoading(false)
    }
  }

  const saveRules = async () => {
    if (!rules) return
    setSaving(true)
    setMessage(null)

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/admin/cache-rules`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(rules)
      })

      const data = await res.json()
      if (data.success) {
        setMessage({ type: 'success', text: 'Cache rules saved successfully!' })
        if (data.rules) setRules(data.rules)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save cache rules' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save cache rules' })
    } finally {
      setSaving(false)
    }
  }

  const updateRule = (client: keyof Omit<CacheRules, 'default'>, key: string, value: number) => {
    if (!rules) return
    setRules({
      ...rules,
      [client]: {
        ...rules[client],
        [key]: value
      }
    })
  }

  const updateDefault = (value: number) => {
    if (!rules) return
    setRules({ ...rules, default: value })
  }

  const clearCache = async (client: string, type?: string) => {
    const clearKey = type ? `${client}:${type}` : client
    if (clearing) return
    setClearing(clearKey)
    setMessage(null)

    try {
      const token = await getToken()
      const url = type
        ? `${API_BASE}/api/admin/cache-clear/${client}/${type}`
        : `${API_BASE}/api/admin/cache-clear/${client}`
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await res.json()
      if (data.success) {
        const label = type ? `${client}:${type}` : client
        setMessage({ type: 'success', text: `Cleared ${data.deleted} ${label} cache entries` })
        fetchData() // Refresh stats
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to clear cache' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to clear cache' })
    } finally {
      setClearing(null)
    }
  }

  if (loading) {
    return <div style={{ padding: 32 }}>Loading...</div>
  }

  if (!rules) {
    return <div style={{ padding: 32, color: '#c62828' }}>Failed to load cache rules</div>
  }

  const chartData = stats ? [
    { name: 'Finnhub', size: stats.finnhub.size, count: stats.finnhub.count },
    { name: 'Polygon', size: stats.polygon.size, count: stats.polygon.count },
    { name: 'Yahoo', size: stats.yahoo.size, count: stats.yahoo.count },
    { name: 'SEC', size: stats.sec.size, count: stats.sec.count },
  ] : []

  const totalSize = stats ? stats.finnhub.size + stats.polygon.size + stats.yahoo.size + stats.sec.size : 0
  const totalCount = stats ? stats.finnhub.count + stats.polygon.count + stats.yahoo.count + stats.sec.count : 0

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid #f0f0f0'
  }

  const labelStyle = {
    fontWeight: 500,
    minWidth: 120
  }

  const clearButtonStyle = (isClearing: boolean) => ({
    padding: '2px 6px',
    fontSize: 11,
    border: '1px solid #e57373',
    borderRadius: 3,
    background: '#fff',
    color: '#c62828',
    cursor: isClearing ? 'not-allowed' : 'pointer',
    opacity: isClearing ? 0.6 : 1,
    marginLeft: 8
  })

  const ClearButton = ({ client, type }: { client: string; type: string }) => {
    const clearKey = `${client}:${type}`
    const isClearing = clearing === clearKey
    return (
      <button
        onClick={() => clearCache(client, type)}
        disabled={isClearing}
        style={clearButtonStyle(isClearing)}
      >
        {isClearing ? '...' : 'clear'}
      </button>
    )
  }

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <h1 style={{ marginBottom: 8 }}>Cache Rules</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Configure cache TTL (time-to-live) durations. Changes take effect immediately.
      </p>

      {message && (
        <div style={{
          padding: 12,
          background: message.type === 'success' ? '#e8f5e9' : '#ffebee',
          color: message.type === 'success' ? '#2e7d32' : '#c62828',
          borderRadius: 4,
          marginBottom: 16,
          fontSize: 14
        }}>
          {message.text}
        </div>
      )}

      {/* Cache Storage Chart */}
      {stats && (
        <div style={{
          background: '#fff',
          border: '1px solid #e0e0e0',
          borderRadius: 8,
          padding: 20,
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Cache Storage</h3>
            <div style={{ fontSize: 13, color: '#666' }}>
              {formatBytes(totalSize)} total ({totalCount} keys)
            </div>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <XAxis type="number" tickFormatter={(v) => formatBytes(v)} fontSize={11} />
                <YAxis type="category" dataKey="name" width={60} fontSize={12} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatBytes(value), 'Size']}
                  labelFormatter={(label) => {
                    const item = chartData.find(d => d.name === label)
                    return `${label} (${item?.count || 0} keys)`
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="size" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>No cached data</div>
          )}
        </div>
      )}

      {/* Finnhub Section */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 20,
        marginBottom: 16
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Finnhub</h3>
        <div style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>Quote</span>
            <ClearButton client="finnhub" type="quote" />
          </div>
          <DurationSelector value={rules.finnhub.quote} onChange={(v) => updateRule('finnhub', 'quote', v)} />
        </div>
        <div style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>Candles</span>
            <ClearButton client="finnhub" type="candles" />
          </div>
          <DurationSelector value={rules.finnhub.candles} onChange={(v) => updateRule('finnhub', 'candles', v)} />
        </div>
        <div style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>Profile</span>
            <ClearButton client="finnhub" type="profile" />
          </div>
          <DurationSelector value={rules.finnhub.profile} onChange={(v) => updateRule('finnhub', 'profile', v)} />
        </div>
        <div style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>Financials</span>
            <ClearButton client="finnhub" type="financials" />
          </div>
          <DurationSelector value={rules.finnhub.financials} onChange={(v) => updateRule('finnhub', 'financials', v)} />
        </div>
        <div style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>Search</span>
            <ClearButton client="finnhub" type="search" />
          </div>
          <DurationSelector value={rules.finnhub.search} onChange={(v) => updateRule('finnhub', 'search', v)} />
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>News</span>
            <ClearButton client="finnhub" type="news" />
          </div>
          <DurationSelector value={rules.finnhub.news} onChange={(v) => updateRule('finnhub', 'news', v)} />
        </div>
      </div>

      {/* Polygon Section */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 20,
        marginBottom: 16
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Polygon</h3>
        <div style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>Tickers</span>
            <ClearButton client="polygon" type="tickers" />
          </div>
          <DurationSelector value={rules.polygon.tickers} onChange={(v) => updateRule('polygon', 'tickers', v)} />
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>Ticker Details</span>
            <ClearButton client="polygon" type="tickerDetails" />
          </div>
          <DurationSelector value={rules.polygon.tickerDetails} onChange={(v) => updateRule('polygon', 'tickerDetails', v)} />
        </div>
      </div>

      {/* Yahoo Finance Section */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 20,
        marginBottom: 16
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Yahoo Finance</h3>
        <div style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>History</span>
            <ClearButton client="yahoo" type="history" />
          </div>
          <DurationSelector value={rules.yahoo.history} onChange={(v) => updateRule('yahoo', 'history', v)} />
        </div>
        <div style={rowStyle}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>History Archive</span>
            <ClearButton client="yahoo" type="historyArchive" />
          </div>
          <DurationSelector value={rules.yahoo.historyArchive} onChange={(v) => updateRule('yahoo', 'historyArchive', v)} />
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>Quote</span>
            <ClearButton client="yahoo" type="quote" />
          </div>
          <DurationSelector value={rules.yahoo.quote} onChange={(v) => updateRule('yahoo', 'quote', v)} />
        </div>
      </div>

      {/* SEC Section */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 20,
        marginBottom: 16
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>SEC</h3>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={labelStyle}>Filings</span>
            <ClearButton client="sec" type="filing" />
          </div>
          <DurationSelector value={rules.sec.filings} onChange={(v) => updateRule('sec', 'filings', v)} />
        </div>
      </div>

      {/* Default Section */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 20,
        marginBottom: 24
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Default</h3>
        <div style={{ ...rowStyle, borderBottom: 'none' }}>
          <span style={labelStyle}>Fallback TTL</span>
          <DurationSelector value={rules.default} onChange={updateDefault} />
        </div>
      </div>

      <button
        onClick={saveRules}
        disabled={saving}
        style={{
          padding: '12px 24px',
          background: '#1976d2',
          border: 'none',
          color: '#fff',
          borderRadius: 4,
          fontSize: 14,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.6 : 1
        }}
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  )
}

export default RedisRules
