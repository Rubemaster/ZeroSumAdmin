import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

interface StripePrice {
  id: string
  unit_amount: number | null
  currency: string
  recurring: {
    interval: string
    interval_count: number
  } | null
}

interface StripeProduct {
  id: string
  name: string
  description: string | null
  active: boolean
  images: string[]
  metadata: Record<string, string>
  default_price: StripePrice | null
  prices: StripePrice[]
}

function StripeProducts() {
  const { getToken } = useAuth()
  const [products, setProducts] = useState<StripeProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/stripe/products`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch products')
      }

      const data = await response.json()
      setProducts(data.products || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: StripePrice | null) => {
    if (!price || price.unit_amount === null) return 'Free'
    const amount = (price.unit_amount / 100).toFixed(2)
    const currency = price.currency.toUpperCase()
    const interval = price.recurring ? `/${price.recurring.interval}` : ''
    return `${currency} ${amount}${interval}`
  }

  if (loading) {
    return <div className="loading">Loading products...</div>
  }

  if (error) {
    return (
      <div className="error">
        {error}
        <button className="btn btn-primary" onClick={fetchProducts} style={{ marginLeft: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="empty">
        No products found in your Stripe account.
      </div>
    )
  }

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Products</div>
          <div className="stat-value">{products.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value">{products.filter(p => p.active).length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Inactive</div>
          <div className="stat-value">{products.filter(p => !p.active).length}</div>
        </div>
      </div>

      <div className="table-section">
        <div className="table-title">Stripe Products</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Status</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {product.images[0] && (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
                      />
                    )}
                    <div>
                      <div style={{ fontWeight: 500 }}>{product.name}</div>
                      {product.description && (
                        <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                          {product.description.length > 60
                            ? product.description.slice(0, 60) + '...'
                            : product.description}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ fontWeight: 500 }}>{formatPrice(product.default_price)}</td>
                <td>
                  <span
                    className={`toggle-btn ${product.active ? 'active' : ''}`}
                    style={{ cursor: 'default' }}
                  >
                    {product.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#666' }}>
                  {product.id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default StripeProducts
