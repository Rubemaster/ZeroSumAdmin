import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

interface ClerkUser {
  id: string
  firstName: string | null
  lastName: string | null
  createdAt: number
  lastSignInAt: number | null
  isAdmin: boolean
  onWaitlist: boolean
}

interface AlpacaAccount {
  id: string
  accountNumber: string
  status: string
  createdAt: string
  firstName: string | null
  lastName: string | null
}

interface StripeCustomer {
  id: string
  name: string | null
  created: number
}

interface UnifiedUser {
  email: string | null
  clerk: ClerkUser | null
  alpaca: AlpacaAccount | null
  stripe: StripeCustomer | null
}

interface UsersResponse {
  users: UnifiedUser[]
  counts: {
    total: number
    clerk: number
    alpaca: number
    stripe: number
  }
}

interface EditingUser {
  user: UnifiedUser
  firstName: string
  lastName: string
}

function UsersOverview() {
  const { getToken } = useAuth()
  const [data, setData] = useState<UsersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'clerk' | 'alpaca' | 'stripe'>('all')
  const [search, setSearch] = useState('')
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingStripe, setDeletingStripe] = useState<UnifiedUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/users/overview`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const createStripeCustomer = async (email: string, name?: string) => {
    setCreatingFor(email)
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/stripe/customers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, name })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to create customer')
      }

      const { customer } = await response.json()

      // Update local state instead of refetching
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          counts: { ...prev.counts, stripe: prev.counts.stripe + 1 },
          users: prev.users.map(u => {
            if (u.email?.toLowerCase() !== email.toLowerCase()) return u
            return {
              ...u,
              stripe: {
                id: customer.id,
                name: customer.name || null,
                created: customer.created,
              }
            }
          })
        }
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create Stripe customer')
    } finally {
      setCreatingFor(null)
    }
  }

  const openEditModal = (user: UnifiedUser) => {
    // Get current name from Clerk, Stripe, or Alpaca
    let firstName = user.clerk?.firstName || ''
    let lastName = user.clerk?.lastName || ''

    // If no Clerk name, try to parse from Stripe
    if (!firstName && !lastName && user.stripe?.name) {
      const parts = user.stripe.name.trim().split(/\s+/)
      firstName = parts[0] || ''
      lastName = parts.slice(1).join(' ') || ''
    }

    // If still no name, try Alpaca
    if (!firstName && !lastName && user.alpaca) {
      firstName = user.alpaca.firstName || ''
      lastName = user.alpaca.lastName || ''
    }

    setEditing({ user, firstName, lastName })
  }

  const saveUserChanges = async () => {
    if (!editing) return
    setSaving(true)

    try {
      const token = await getToken()
      const promises: Promise<Response>[] = []

      const firstName = editing.firstName.trim()
      const lastName = editing.lastName.trim()
      const fullName = `${firstName} ${lastName}`.trim()

      // Update Clerk user if they have one
      if (editing.user.clerk) {
        const clerkChanged =
          firstName !== (editing.user.clerk.firstName || '') ||
          lastName !== (editing.user.clerk.lastName || '')

        if (clerkChanged) {
          promises.push(
            fetch(`${API_BASE}/api/admin/users/${editing.user.clerk.id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ firstName, lastName })
            })
          )
        }
      }

      // Update Stripe customer if they have one
      if (editing.user.stripe) {
        if (fullName !== (editing.user.stripe.name || '')) {
          promises.push(
            fetch(`${API_BASE}/api/stripe/customers/${editing.user.stripe.id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ name: fullName || null })
            })
          )
        }
      }

      // Update Alpaca account if they have one
      if (editing.user.alpaca) {
        const alpacaChanged =
          firstName !== (editing.user.alpaca.firstName || '') ||
          lastName !== (editing.user.alpaca.lastName || '')

        if (alpacaChanged) {
          promises.push(
            fetch(`${API_BASE}/api/alpaca/accounts/${editing.user.alpaca.id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ firstName, lastName })
            })
          )
        }
      }

      if (promises.length > 0) {
        const results = await Promise.all(promises)
        const failed = results.find(r => !r.ok)
        if (failed) {
          const err = await failed.json()
          throw new Error(err.error || 'Failed to save changes')
        }
      }

      // Update local state instead of refetching
      setData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          users: prev.users.map(u => {
            if (u.email !== editing.user.email) return u
            return {
              ...u,
              clerk: u.clerk ? { ...u.clerk, firstName, lastName } : null,
              stripe: u.stripe ? { ...u.stripe, name: fullName || null } : null,
              alpaca: u.alpaca ? { ...u.alpaca, firstName, lastName } : null,
            }
          })
        }
      })

      setEditing(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const deleteStripeCustomer = async () => {
    if (!deletingStripe?.stripe) return
    setDeleting(true)

    try {
      const token = await getToken()
      const response = await fetch(
        `${API_BASE}/api/stripe/customers/${deletingStripe.stripe.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to delete customer')
      }

      // Update local state
      setData(prev => {
        if (!prev) return prev
        const email = deletingStripe.email?.toLowerCase()
        return {
          ...prev,
          counts: { ...prev.counts, stripe: prev.counts.stripe - 1 },
          users: prev.users.map(u => {
            if (u.email?.toLowerCase() !== email) return u
            return { ...u, stripe: null }
          }).filter(u => u.clerk || u.alpaca || u.stripe)
        }
      })

      setDeletingStripe(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete Stripe customer')
    } finally {
      setDeleting(false)
    }
  }

  const filteredUsers = data?.users.filter(user => {
    // Apply platform filter
    if (filter === 'clerk' && !user.clerk) return false
    if (filter === 'alpaca' && !user.alpaca) return false
    if (filter === 'stripe' && !user.stripe) return false

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase()
      const email = user.email?.toLowerCase() || ''
      const name = user.clerk
        ? `${user.clerk.firstName || ''} ${user.clerk.lastName || ''}`.toLowerCase()
        : user.stripe?.name?.toLowerCase() || ''
      return email.includes(searchLower) || name.includes(searchLower)
    }

    return true
  }) || []

  if (loading) {
    return <div className="loading">Loading users...</div>
  }

  if (error) {
    return (
      <div className="error">
        {error}
        <button className="btn btn-primary" onClick={fetchUsers} style={{ marginLeft: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{data?.counts.total || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Clerk Users</div>
          <div className="stat-value">{data?.counts.clerk || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Alpaca Accounts</div>
          <div className="stat-value">{data?.counts.alpaca || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stripe Customers</div>
          <div className="stat-value">{data?.counts.stripe || 0}</div>
        </div>
      </div>

      <div className="table-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="table-title" style={{ margin: 0 }}>Users by Platform</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #ddd',
                fontSize: 13,
                width: 200,
              }}
            />
            <button
              className={`toggle-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={`toggle-btn ${filter === 'clerk' ? 'active' : ''}`}
              onClick={() => setFilter('clerk')}
            >
              Clerk
            </button>
            <button
              className={`toggle-btn ${filter === 'alpaca' ? 'active' : ''}`}
              onClick={() => setFilter('alpaca')}
            >
              Alpaca
            </button>
            <button
              className={`toggle-btn ${filter === 'stripe' ? 'active' : ''}`}
              onClick={() => setFilter('stripe')}
            >
              Stripe
            </button>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th style={{ textAlign: 'center' }}>Clerk</th>
              <th style={{ textAlign: 'center' }}>Alpaca</th>
              <th style={{ textAlign: 'center' }}>Stripe</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: 24 }}>
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map((user, idx) => (
                <tr key={user.email || idx}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {user.email || <span style={{ color: '#999' }}>No email</span>}
                  </td>
                  <td>
                    {user.clerk?.firstName || user.clerk?.lastName
                      ? `${user.clerk.firstName || ''} ${user.clerk.lastName || ''}`.trim()
                      : user.stripe?.name
                        ? user.stripe.name
                        : user.alpaca?.firstName || user.alpaca?.lastName
                          ? `${user.alpaca.firstName || ''} ${user.alpaca.lastName || ''}`.trim()
                          : <span style={{ color: '#999' }}>-</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {user.clerk ? (
                      <span
                        className="toggle-btn active"
                        style={{ cursor: 'default', fontSize: 11 }}
                        title={`ID: ${user.clerk.id}`}
                      >
                        {user.clerk.isAdmin ? 'Admin' : 'User'}
                      </span>
                    ) : (
                      <span style={{ color: '#ccc' }}>-</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {user.alpaca ? (
                      <span
                        className={`toggle-btn ${user.alpaca.status === 'ACTIVE' ? 'active' : ''}`}
                        style={{ cursor: 'default', fontSize: 11 }}
                        title={`Account: ${user.alpaca.accountNumber}`}
                      >
                        {user.alpaca.status}
                      </span>
                    ) : (
                      <span style={{ color: '#ccc' }}>-</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {user.stripe ? (
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                        <span
                          className="toggle-btn active"
                          style={{ cursor: 'default', fontSize: 11 }}
                          title={`ID: ${user.stripe.id}`}
                        >
                          Customer
                        </span>
                        <button
                          className="btn"
                          style={{ fontSize: 11, padding: '4px 6px', color: '#c00' }}
                          onClick={() => setDeletingStripe(user)}
                          title="Delete Stripe customer"
                        >
                          ×
                        </button>
                      </div>
                    ) : user.email ? (
                      <button
                        className="btn"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() => createStripeCustomer(
                          user.email!,
                          user.clerk ? `${user.clerk.firstName || ''} ${user.clerk.lastName || ''}`.trim() : undefined
                        )}
                        disabled={creatingFor === user.email}
                      >
                        {creatingFor === user.email ? '...' : 'Create'}
                      </button>
                    ) : (
                      <span style={{ color: '#ccc' }}>-</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {(user.clerk || user.stripe || user.alpaca) && (
                      <button
                        className="btn"
                        style={{ fontSize: 11, padding: '4px 8px' }}
                        onClick={() => openEditModal(user)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 8,
              padding: 24,
              width: 400,
              maxWidth: '90vw',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>
              Edit User
            </h3>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              {editing.user.email}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: '#333' }}>
                    First Name
                  </div>
                  <input
                    type="text"
                    placeholder="First Name"
                    value={editing.firstName}
                    onChange={(e) => setEditing({ ...editing, firstName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: '#333' }}>
                    Last Name
                  </div>
                  <input
                    type="text"
                    placeholder="Last Name"
                    value={editing.lastName}
                    onChange={(e) => setEditing({ ...editing, lastName: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      fontSize: 14,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
                {(() => {
                  const platforms = []
                  if (editing.user.clerk) platforms.push('Clerk')
                  if (editing.user.stripe) platforms.push('Stripe')
                  if (editing.user.alpaca) platforms.push('Alpaca')
                  return platforms.length > 1
                    ? `Syncs to ${platforms.join(', ')}`
                    : `Updates ${platforms[0]}`
                })()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
              <button
                className="btn"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveUserChanges}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingStripe && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setDeletingStripe(null)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 8,
              padding: 24,
              width: 400,
              maxWidth: '90vw',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#c00' }}>
              Delete Stripe Customer
            </h3>
            <p style={{ fontSize: 14, color: '#333', marginBottom: 8 }}>
              Are you sure you want to delete this Stripe customer?
            </p>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              <strong>Email:</strong> {deletingStripe.email}<br />
              <strong>Customer ID:</strong> {deletingStripe.stripe?.id}
            </p>
            <p style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
              This action cannot be undone. The customer will be permanently deleted from Stripe.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
              <button
                className="btn"
                onClick={() => setDeletingStripe(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: '#c00', color: '#fff', borderColor: '#c00' }}
                onClick={deleteStripeCustomer}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default UsersOverview
