import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://zerosumserver.onrender.com'

interface Position {
  userEmail: string
  userName: string
  alpacaAccountId: string
  alpacaAccountNumber: string
  symbol: string
  qty: string
  side: string
  marketValue: string
  costBasis: string
  unrealizedPL: string
  unrealizedPLPercent: string
  currentPrice: string
  avgEntryPrice: string
  assetId: string
  assetClass: string
}

interface PositionsResponse {
  positions: Position[]
  total: number
  limit: number
  offset: number
}

function OpenPositions() {
  const { getToken } = useAuth()
  const [data, setData] = useState<PositionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const limit = 50

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    fetchPositions()
  }, [debouncedSearch, page])

  const fetchPositions = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = await getToken()

      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(page * limit),
      })
      if (debouncedSearch) {
        params.append('search', debouncedSearch)
      }

      const response = await fetch(
        `${API_BASE}/api/admin/positions?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch positions')
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load positions')
    } finally {
      setLoading(false)
    }
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0

  const formatCurrency = (value: string) => {
    const num = parseFloat(value)
    return isNaN(num) ? '-' : `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatPercent = (value: string) => {
    const num = parseFloat(value) * 100
    return isNaN(num) ? '-' : `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`
  }

  const getPLClass = (value: string) => {
    const num = parseFloat(value)
    if (isNaN(num)) return ''
    return num >= 0 ? 'pl-positive' : 'pl-negative'
  }

  if (loading && !data) {
    return <div className="loading">Loading positions...</div>
  }

  if (error) {
    return (
      <div className="error">
        {error}
        <button className="btn btn-primary" onClick={fetchPositions} style={{ marginLeft: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Positions</div>
          <div className="stat-value">{data?.total || 0}</div>
        </div>
      </div>

      <div className="table-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="table-title" style={{ margin: 0 }}>All Open Positions</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #ddd',
                fontSize: 13,
                width: 250,
              }}
            />
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Symbol</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Current Price</th>
              <th style={{ textAlign: 'right' }}>Avg Entry</th>
              <th style={{ textAlign: 'right' }}>Market Value</th>
              <th style={{ textAlign: 'right' }}>Cost Basis</th>
              <th style={{ textAlign: 'right' }}>Unrealized P/L</th>
            </tr>
          </thead>
          <tbody>
            {!data?.positions.length ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: '#999', padding: 24 }}>
                  No positions found
                </td>
              </tr>
            ) : (
              data.positions.map((pos, idx) => (
                <tr key={`${pos.alpacaAccountId}-${pos.symbol}-${idx}`}>
                  <td>
                    <div style={{ fontSize: 13 }}>{pos.userName || '-'}</div>
                    <div style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
                      {pos.userEmail || '-'}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{pos.symbol}</td>
                  <td style={{ textAlign: 'right' }}>{pos.qty}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(pos.currentPrice)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(pos.avgEntryPrice)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(pos.marketValue)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(pos.costBasis)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={getPLClass(pos.unrealizedPL)}>
                      {formatCurrency(pos.unrealizedPL)} ({formatPercent(pos.unrealizedPLPercent)})
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid #eee'
          }}>
            <div style={{ fontSize: 13, color: '#666' }}>
              Showing {data!.offset + 1}-{Math.min(data!.offset + data!.positions.length, data!.total)} of {data!.total}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </button>
              <button
                className="btn"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= totalPages - 1}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default OpenPositions
