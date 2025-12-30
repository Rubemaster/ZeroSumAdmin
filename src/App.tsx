import { useEffect, useState } from 'react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth
} from '@clerk/clerk-react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import StripeProducts from './pages/StripeProducts'
import UsersOverview from './pages/UsersOverview'
import OpenPositions from './pages/OpenPositions'
import SECBackfill from './pages/SECBackfill'
import SECDailyIndices from './pages/SECDailyIndices'
import Settings from './pages/Settings'
import RedisRules from './pages/RedisRules'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

interface WaitlistUser {
  id: string
  email: string
  firstName: string
  lastName: string
  plan: string
  joinedAt: string
}

interface ClerkUser {
  id: string
  email: string
  firstName: string
  lastName: string
  createdAt: number
  lastSignInAt: number
  onWaitlist: boolean
  plan: string | null
  isAdmin: boolean
  hasTradingAccess: boolean
}

interface AlpacaAccount {
  id: string
  email: string
  firstName: string
  lastName: string
  status: string
  createdAt: string
  accountNumber: string
}

interface ChartDataPoint {
  date: string
  waitlist: number
  alpaca: number
}

interface AdminStats {
  totalUsers: number
  totalWaitlist: number
  totalAlpacaAccounts: number
  waitlistUsers: WaitlistUser[]
  allUsers: ClerkUser[]
  alpacaAccountsList: AlpacaAccount[]
  chartData: ChartDataPoint[]
}

interface UserMetadata {
  id: string
  email: string
  firstName: string
  lastName: string
  privateMetadata: Record<string, unknown>
  publicMetadata: Record<string, unknown>
}

function Dashboard() {
  const { getToken } = useAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserMetadata | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch stats')
      }

      const data = await response.json()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const toggleAdmin = async (userId: string, currentValue: boolean) => {
    setUpdating(`admin-${userId}`)
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/users/${userId}/admin`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isAdmin: !currentValue })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update')
      }

      // Update local state
      setStats(prev => prev ? {
        ...prev,
        allUsers: prev.allUsers.map(u =>
          u.id === userId ? { ...u, isAdmin: !currentValue } : u
        )
      } : null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update admin status')
    } finally {
      setUpdating(null)
    }
  }

  const toggleTrading = async (userId: string, currentValue: boolean) => {
    setUpdating(`trading-${userId}`)
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/users/${userId}/trading`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hasTradingAccess: !currentValue })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update')
      }

      // Update local state
      setStats(prev => prev ? {
        ...prev,
        allUsers: prev.allUsers.map(u =>
          u.id === userId ? { ...u, hasTradingAccess: !currentValue } : u
        )
      } : null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update trading access')
    } finally {
      setUpdating(null)
    }
  }

  const bootstrapAdmin = async () => {
    setUpdating('bootstrap')
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/bootstrap`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to bootstrap')
      }

      alert('You are now an admin! Refreshing...')
      fetchStats()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to bootstrap admin')
    } finally {
      setUpdating(null)
    }
  }

  const fetchMetadata = async (userId: string) => {
    setLoadingMeta(true)
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/users/${userId}/metadata`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch metadata')
      }

      const data = await response.json()
      setSelectedUser(data)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to fetch metadata')
    } finally {
      setLoadingMeta(false)
    }
  }

  const hasAdmins = stats?.allUsers?.some(u => u.isAdmin) ?? false

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (error) {
    return <div className="error">Error: {error}</div>
  }

  if (!stats) {
    return <div className="error">No data available</div>
  }

  return (
    <>
      {!hasAdmins && (
        <div className="bootstrap-banner">
          <span>No admins configured.</span>
          <button
            className="btn btn-primary"
            onClick={bootstrapAdmin}
            disabled={updating === 'bootstrap'}
          >
            {updating === 'bootstrap' ? 'Setting up...' : 'Become Admin'}
          </button>
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{stats.totalUsers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Waitlist</div>
          <div className="stat-value">{stats.totalWaitlist}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Alpaca Accounts</div>
          <div className="stat-value">{stats.totalAlpacaAccounts}</div>
        </div>
      </div>

      <div className="chart-section">
        <div className="chart-title">Accounts Over Time</div>
        {stats.chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                stroke="#999"
              />
              <YAxis tick={{ fontSize: 11 }} stroke="#999" />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="waitlist"
                stroke="#666"
                strokeWidth={2}
                dot={false}
                name="Waitlist"
              />
              <Line
                type="monotone"
                dataKey="alpaca"
                stroke="#333"
                strokeWidth={2}
                dot={false}
                name="Alpaca Accounts"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty">No data yet</div>
        )}
      </div>

      <div className="table-section">
        <div className="table-title">Waitlist Users</div>
        {stats.waitlistUsers.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Plan</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {stats.waitlistUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>{[user.firstName, user.lastName].filter(Boolean).join(' ') || '-'}</td>
                  <td>{user.plan}</td>
                  <td>{user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No waitlist users yet</div>
        )}
      </div>

      <div className="table-section">
        <div className="table-title">All Clerk Users</div>
        {stats.allUsers.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Admin</th>
                <th>Trading</th>
                <th>Waitlist</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stats.allUsers.map((user) => (
                <tr key={user.id}>
                  <td>{user.email || '-'}</td>
                  <td>{[user.firstName, user.lastName].filter(Boolean).join(' ') || '-'}</td>
                  <td>
                    <button
                      className={`toggle-btn ${user.isAdmin ? 'active' : ''}`}
                      onClick={() => toggleAdmin(user.id, user.isAdmin)}
                      disabled={updating === `admin-${user.id}`}
                    >
                      {updating === `admin-${user.id}` ? '...' : user.isAdmin ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td>
                    <button
                      className={`toggle-btn ${user.hasTradingAccess ? 'active' : ''}`}
                      onClick={() => toggleTrading(user.id, user.hasTradingAccess)}
                      disabled={updating === `trading-${user.id}`}
                    >
                      {updating === `trading-${user.id}` ? '...' : user.hasTradingAccess ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td>{user.onWaitlist ? 'Yes' : 'No'}</td>
                  <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</td>
                  <td>
                    <button
                      className="meta-btn"
                      onClick={() => fetchMetadata(user.id)}
                      disabled={loadingMeta}
                    >
                      Meta
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No users yet</div>
        )}
      </div>

      <div className="table-section">
        <div className="table-title">All Alpaca Accounts</div>
        {stats.alpacaAccountsList.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Account #</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {stats.alpacaAccountsList.map((acc) => (
                <tr key={acc.id}>
                  <td>{acc.email || '-'}</td>
                  <td>{[acc.firstName, acc.lastName].filter(Boolean).join(' ') || '-'}</td>
                  <td>{acc.accountNumber || '-'}</td>
                  <td>{acc.status || '-'}</td>
                  <td>{acc.createdAt ? new Date(acc.createdAt).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No Alpaca accounts yet</div>
        )}
      </div>

      {selectedUser && (
        <div className="side-panel-overlay" onClick={() => setSelectedUser(null)}>
          <div className="side-panel" onClick={(e) => e.stopPropagation()}>
            <div className="side-panel-header">
              <div className="side-panel-title">User Metadata</div>
              <button className="side-panel-close" onClick={() => setSelectedUser(null)}>
                &times;
              </button>
            </div>
            <div className="side-panel-content">
              <div className="meta-section">
                <div className="meta-label">User ID</div>
                <div className="meta-value mono">{selectedUser.id}</div>
              </div>
              <div className="meta-section">
                <div className="meta-label">Email</div>
                <div className="meta-value">{selectedUser.email || '-'}</div>
              </div>
              <div className="meta-section">
                <div className="meta-label">Name</div>
                <div className="meta-value">
                  {[selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ') || '-'}
                </div>
              </div>
              <div className="meta-section">
                <div className="meta-label">Private Metadata</div>
                <pre className="meta-json">
                  {JSON.stringify(selectedUser.privateMetadata, null, 2)}
                </pre>
              </div>
              <div className="meta-section">
                <div className="meta-label">Public Metadata</div>
                <pre className="meta-json">
                  {JSON.stringify(selectedUser.publicMetadata, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function App() {
  const location = useLocation()
  const path = location.pathname

  const getTitle = () => {
    if (path === '/products') return 'Stripe Products'
    if (path === '/users') return 'Users'
    if (path === '/positions') return 'Open Positions'
    if (path === '/sec-backfill') return 'SEC Backfill'
    if (path === '/sec-daily-indices') return 'SEC Daily Indices'
    if (path === '/settings') return 'Settings'
    if (path === '/cache-rules') return 'Cache Rules'
    return 'Dashboard'
  }

  return (
    <>
      <SignedOut>
        <div className="login-container">
          <div className="login-box">
            <h2>ZeroSum Admin</h2>
            <p>Sign in to access the admin dashboard</p>
            <SignInButton mode="modal">
              <button className="btn btn-primary">Sign In</button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        <div className="admin">
          <aside className="admin-sidebar">
            <div className="sidebar-brand">ZeroSum</div>
            <nav className="sidebar-nav">
              <Link
                to="/"
                className={`sidebar-link ${path === '/' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
                Dashboard
              </Link>
              <Link
                to="/products"
                className={`sidebar-link ${path === '/products' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                Stripe Products
              </Link>
              <Link
                to="/users"
                className={`sidebar-link ${path === '/users' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Users
              </Link>
              <Link
                to="/positions"
                className={`sidebar-link ${path === '/positions' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                Positions
              </Link>
              <Link
                to="/sec-backfill"
                className={`sidebar-link ${path === '/sec-backfill' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                SEC Backfill
              </Link>
              <Link
                to="/sec-daily-indices"
                className={`sidebar-link ${path === '/sec-daily-indices' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                SEC Daily Indices
              </Link>
              <Link
                to="/settings"
                className={`sidebar-link ${path === '/settings' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Settings
              </Link>
              <Link
                to="/cache-rules"
                className={`sidebar-link ${path === '/cache-rules' ? 'active' : ''}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                </svg>
                Cache Rules
              </Link>
            </nav>
          </aside>
          <div className="admin-main">
            <header className="admin-header">
              <div className="admin-title">{getTitle()}</div>
              <UserButton />
            </header>
            <main className="admin-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/products" element={<StripeProducts />} />
                <Route path="/users" element={<UsersOverview />} />
                <Route path="/positions" element={<OpenPositions />} />
                <Route path="/sec-backfill" element={<SECBackfill />} />
                <Route path="/sec-daily-indices" element={<SECDailyIndices />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/cache-rules" element={<RedisRules />} />
              </Routes>
            </main>
          </div>
        </div>
      </SignedIn>
    </>
  )
}

export default App
