import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

interface ConnectionStatus {
  configured: boolean
  connected: boolean
  error?: string
}

function Settings() {
  const { getToken } = useAuth()
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null)
  const [connectionString, setConnectionString] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showDropConfirm, setShowDropConfirm] = useState(false)
  const [dropping, setDropping] = useState(false)

  useEffect(() => {
    checkConnectionStatus()
  }, [])

  const checkConnectionStatus = async () => {
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/admin/settings/database/status`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      setConnectionStatus(data)
    } catch (err) {
      console.error('Failed to check connection status:', err)
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async () => {
    if (!connectionString.trim()) {
      setMessage({ type: 'error', text: 'Please enter a connection string' })
      return
    }

    setTesting(true)
    setMessage(null)

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/admin/settings/database/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ connectionString })
      })

      const data = await res.json()

      if (data.success) {
        setMessage({ type: 'success', text: 'Connection successful!' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Connection failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to test connection' })
    } finally {
      setTesting(false)
    }
  }

  const saveConnection = async () => {
    if (!connectionString.trim()) {
      setMessage({ type: 'error', text: 'Please enter a connection string' })
      return
    }

    setSaving(true)
    setMessage(null)

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/admin/settings/database/connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ connectionString })
      })

      const data = await res.json()

      if (data.success) {
        setMessage({ type: 'success', text: 'Connection string saved successfully!' })
        setConnectionString('')
        await checkConnectionStatus()
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save connection string' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save connection string' })
    } finally {
      setSaving(false)
    }
  }

  const handleDropAll = async () => {
    setDropping(true)
    setMessage(null)
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/db/drop-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ confirm: 'DELETE_ALL_DATA' })
      })

      const data = await response.json()
      if (data.success) {
        setShowDropConfirm(false)
        setMessage({ type: 'success', text: 'All tables dropped successfully' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to drop tables' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to drop tables' })
    } finally {
      setDropping(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 32 }}>Loading...</div>
  }

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <h1 style={{ marginBottom: 24 }}>Settings</h1>

      {/* Database Connection Section */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 24,
        marginBottom: 24
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Database Connection</h2>

        {/* Current Status */}
        <div style={{
          padding: 16,
          background: connectionStatus?.connected ? '#e8f5e9' : connectionStatus?.configured ? '#fff3e0' : '#fce4ec',
          borderRadius: 4,
          marginBottom: 20
        }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            Status: {connectionStatus?.connected ? 'Connected' : connectionStatus?.configured ? 'Configured (not tested)' : 'Not Configured'}
          </div>
          {connectionStatus?.error && (
            <div style={{ color: '#c62828', fontSize: 13 }}>
              Error: {connectionStatus.error}
            </div>
          )}
        </div>

        {/* Message */}
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

        {/* Connection String Input + Buttons on same line */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="password"
            placeholder="postgresql://postgres:PASSWORD@host:5432/postgres"
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: 13,
              fontFamily: 'monospace'
            }}
          />
          <button
            onClick={testConnection}
            disabled={testing || saving || !connectionString.trim()}
            style={{
              padding: '10px 16px',
              background: '#fff',
              border: '1px solid #1976d2',
              color: '#1976d2',
              borderRadius: 4,
              cursor: testing || saving || !connectionString.trim() ? 'not-allowed' : 'pointer',
              opacity: testing || saving || !connectionString.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap'
            }}
          >
            {testing ? 'Testing...' : 'Test'}
          </button>
          <button
            onClick={saveConnection}
            disabled={saving || testing || !connectionString.trim()}
            style={{
              padding: '10px 16px',
              background: '#1976d2',
              border: 'none',
              color: '#fff',
              borderRadius: 4,
              cursor: saving || testing || !connectionString.trim() ? 'not-allowed' : 'pointer',
              opacity: saving || testing || !connectionString.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap'
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          {!showDropConfirm ? (
            <button
              onClick={() => setShowDropConfirm(true)}
              style={{
                padding: '10px 16px',
                background: '#c62828',
                border: 'none',
                color: '#fff',
                borderRadius: 4,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Drop All Tables
            </button>
          ) : (
            <>
              <button
                onClick={handleDropAll}
                disabled={dropping}
                style={{
                  padding: '10px 16px',
                  background: '#b71c1c',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 4,
                  cursor: dropping ? 'not-allowed' : 'pointer',
                  opacity: dropping ? 0.6 : 1,
                  whiteSpace: 'nowrap'
                }}
              >
                {dropping ? 'Dropping...' : 'Confirm Delete'}
              </button>
              <button
                onClick={() => setShowDropConfirm(false)}
                disabled={dropping}
                style={{
                  padding: '10px 16px',
                  background: '#fff',
                  border: '1px solid #999',
                  borderRadius: 4,
                  cursor: dropping ? 'not-allowed' : 'pointer',
                  opacity: dropping ? 0.6 : 1,
                  whiteSpace: 'nowrap'
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          Special characters in password must be URL-encoded (e.g., @ becomes %40)
        </div>
      </div>
    </div>
  )
}

export default Settings
