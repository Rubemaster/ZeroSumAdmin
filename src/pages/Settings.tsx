import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://zerosumserver.onrender.com'

interface ConnectionStatus {
  configured: boolean
  connected: boolean
  error?: string
}

interface ApiKeyConfig {
  key: string
  label: string
  description: string
  signupUrl: string
  rateLimit: string
  requiresKey: boolean
}

const API_KEYS_CONFIG: ApiKeyConfig[] = [
  { key: 'ALPHA_VANTAGE_API_KEY', label: 'Alpha Vantage', description: 'Stocks, Forex, Crypto', signupUrl: 'https://www.alphavantage.co/support/#api-key', rateLimit: '25 requests/day', requiresKey: true },
  { key: 'FINNHUB_API_KEY', label: 'Finnhub', description: 'Stocks, Forex, Crypto, News', signupUrl: 'https://finnhub.io/register', rateLimit: '60 requests/minute', requiresKey: true },
  { key: 'TWELVE_DATA_API_KEY', label: 'Twelve Data', description: 'Stocks, Forex, Crypto', signupUrl: 'https://twelvedata.com/pricing', rateLimit: '800 requests/day', requiresKey: true },
  { key: 'POLYGON_API_KEY', label: 'Polygon.io', description: 'Stocks, Options, Forex, Crypto', signupUrl: 'https://polygon.io/dashboard/signup', rateLimit: '5 requests/minute', requiresKey: true },
  { key: 'FMP_API_KEY', label: 'Financial Modeling Prep', description: 'Stocks, Financials', signupUrl: 'https://financialmodelingprep.com/developer/docs/', rateLimit: '250 requests/day', requiresKey: true },
  { key: 'TIINGO_API_KEY', label: 'Tiingo', description: 'Stocks, Crypto, News', signupUrl: 'https://www.tiingo.com/account/api/token', rateLimit: '50,000 requests/month', requiresKey: true },
  { key: 'FRED_API_KEY', label: 'FRED (Federal Reserve)', description: 'Economic Data, Indicators', signupUrl: 'https://fred.stlouisfed.org/docs/api/api_key.html', rateLimit: 'Unlimited', requiresKey: true },
  { key: 'EXCHANGERATE_API_KEY', label: 'ExchangeRate-API', description: 'Forex Rates', signupUrl: 'https://www.exchangerate-api.com/', rateLimit: '1,500 requests/month', requiresKey: true },
  { key: 'NEWS_API_KEY', label: 'NewsAPI', description: 'Financial News', signupUrl: 'https://newsapi.org/register', rateLimit: '100 requests/day (dev)', requiresKey: true },
  { key: 'MARKETSTACK_API_KEY', label: 'Marketstack', description: 'Stock EOD Data', signupUrl: 'https://marketstack.com/signup/free', rateLimit: '100 requests/month', requiresKey: true },
  { key: 'NASDAQ_DATA_LINK_API_KEY', label: 'Nasdaq Data Link', description: 'Various Financial Data', signupUrl: 'https://data.nasdaq.com/sign-up', rateLimit: '50 requests/day', requiresKey: true },
]


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

  // API Keys state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({})
  const [encryptionConfigured, setEncryptionConfigured] = useState(false)
  const [supabaseConfigured, setSupabaseConfigured] = useState(false)
  const [tableExists, setTableExists] = useState(false)
  const [savingKeys, setSavingKeys] = useState(false)
  const [initializingTable, setInitializingTable] = useState(false)
  const [keyMessage, setKeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    checkConnectionStatus()
    checkApiKeyStatus()
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

  const checkApiKeyStatus = async () => {
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/admin/settings/api-keys/status`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.keys) {
        setApiKeyStatus(data.keys)
      }
      setEncryptionConfigured(data.encryptionConfigured || false)
      setSupabaseConfigured(data.supabaseConfigured || false)
      setTableExists(data.tableExists || false)
    } catch (err) {
      console.error('Failed to check API key status:', err)
    }
  }

  const initializeApiKeysTable = async () => {
    setInitializingTable(true)
    setKeyMessage(null)
    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/admin/settings/api-keys/init`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setKeyMessage({ type: 'success', text: 'API keys table initialized successfully!' })
        await checkApiKeyStatus()
      } else {
        setKeyMessage({ type: 'error', text: data.error || 'Failed to initialize table' })
      }
    } catch (err) {
      setKeyMessage({ type: 'error', text: 'Failed to initialize table' })
    } finally {
      setInitializingTable(false)
    }
  }

  const handleApiKeyChange = (key: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [key]: value }))
  }

  const saveApiKeys = async () => {
    setSavingKeys(true)
    setKeyMessage(null)

    try {
      const token = await getToken()
      const res = await fetch(`${API_BASE}/api/admin/settings/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ keys: apiKeys })
      })

      const data = await res.json()

      if (data.success) {
        setKeyMessage({ type: 'success', text: 'API keys saved successfully!' })
        setApiKeys({})
        await checkApiKeyStatus()
      } else {
        setKeyMessage({ type: 'error', text: data.error || 'Failed to save API keys' })
      }
    } catch (err) {
      setKeyMessage({ type: 'error', text: 'Failed to save API keys' })
    } finally {
      setSavingKeys(false)
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

      {/* Financial Data API Keys Section */}
      <div style={{
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 24,
        marginBottom: 24
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Financial Data API Keys</h2>
        <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
          Configure API keys for external financial data providers. Keys are encrypted and stored securely in Supabase.
        </p>

        {/* Key Message - only show errors */}
        {keyMessage && keyMessage.type === 'error' && (
          <div style={{
            padding: 12,
            background: '#ffebee',
            color: '#c62828',
            borderRadius: 4,
            marginBottom: 16,
            fontSize: 14
          }}>
            {keyMessage.text}
          </div>
        )}

        {!tableExists ? (
          /* Create Table Dialog */
          <div style={{
            padding: 24,
            background: '#f5f5f5',
            borderRadius: 4,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
              The API keys table has not been created in Supabase yet.
            </div>
            <button
              onClick={initializeApiKeysTable}
              disabled={initializingTable}
              style={{
                padding: '12px 24px',
                background: '#1976d2',
                border: 'none',
                color: '#fff',
                borderRadius: 4,
                cursor: initializingTable ? 'not-allowed' : 'pointer',
                opacity: initializingTable ? 0.6 : 1,
                fontSize: 14,
                fontWeight: 500
              }}
            >
              {initializingTable ? 'Creating...' : 'Create Table'}
            </button>
          </div>
        ) : (
          <>
            {/* API Keys Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', borderBottom: '2px solid #ddd', width: 24 }}></th>
                  <th style={{ padding: '8px 6px', borderBottom: '2px solid #ddd', width: 160 }}>Provider</th>
                  <th style={{ padding: '8px 6px', borderBottom: '2px solid #ddd' }}>API Key</th>
                  <th style={{ padding: '8px 6px', borderBottom: '2px solid #ddd', width: 55 }}></th>
                </tr>
              </thead>
              <tbody>
                {API_KEYS_CONFIG.map((config, idx) => (
                  <tr key={config.key} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '6px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                      <span
                        title={`${apiKeyStatus[config.key] ? 'Configured' : 'Not set'}\n${config.description}\nRate: ${config.rateLimit}`}
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: apiKeyStatus[config.key] ? '#4caf50' : '#ff9800',
                          cursor: 'help'
                        }}
                      />
                    </td>
                    <td style={{ padding: '6px', borderBottom: '1px solid #eee', fontWeight: 500 }}>
                      {config.label}
                    </td>
                    <td style={{ padding: '6px', borderBottom: '1px solid #eee' }}>
                      <input
                        type="password"
                        placeholder={apiKeyStatus[config.key] ? '••••••• (set)' : 'Enter key...'}
                        value={apiKeys[config.key] || ''}
                        onChange={(e) => handleApiKeyChange(config.key, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          border: '1px solid #ddd',
                          borderRadius: 3,
                          fontSize: 12,
                          fontFamily: 'monospace',
                          boxSizing: 'border-box'
                        }}
                      />
                    </td>
                    <td style={{ padding: '6px', borderBottom: '1px solid #eee', textAlign: 'center' }}>
                      <a
                        href={config.signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#1976d2', textDecoration: 'none', fontSize: 11 }}
                      >
                        Get Key
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Save Button */}
            <button
              onClick={saveApiKeys}
              disabled={savingKeys || Object.keys(apiKeys).length === 0}
              style={{
                marginTop: 20,
                padding: '12px 24px',
                background: '#1976d2',
                border: 'none',
                color: '#fff',
                borderRadius: 4,
                cursor: savingKeys || Object.keys(apiKeys).length === 0 ? 'not-allowed' : 'pointer',
                opacity: savingKeys || Object.keys(apiKeys).length === 0 ? 0.6 : 1,
                fontSize: 14,
                fontWeight: 500
              }}
            >
              {savingKeys ? 'Saving...' : 'Save API Keys'}
            </button>

            <div style={{ fontSize: 12, color: '#666', marginTop: 12 }}>
              Only enter keys that you want to update. Existing keys will not be overwritten unless you enter a new value.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Settings
