import { useState } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://zerosumserver.onrender.com'

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }
]

const FUNDING_SOURCES = [
  { value: 'employment_income', label: 'Employment Income' },
  { value: 'investments', label: 'Investments' },
  { value: 'inheritance', label: 'Inheritance' },
  { value: 'business_income', label: 'Business Income' },
  { value: 'savings', label: 'Savings' },
  { value: 'family', label: 'Family' }
]

interface CreatedAccount {
  id: string
  accountNumber: string
  status: string
  email: string
  firstName: string
  lastName: string
  createdAt: string
}

function AlpacaAccountCreate() {
  const { getToken } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdAccount, setCreatedAccount] = useState<CreatedAccount | null>(null)

  // Contact fields
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [unit, setUnit] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postalCode, setPostalCode] = useState('')

  // Identity fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [taxId, setTaxId] = useState('')
  const [fundingSource, setFundingSource] = useState<string[]>(['employment_income'])

  // Disclosures
  const [isControlPerson, setIsControlPerson] = useState(false)
  const [isAffiliatedExchangeOrFinra, setIsAffiliatedExchangeOrFinra] = useState(false)
  const [isPoliticallyExposed, setIsPoliticallyExposed] = useState(false)
  const [immediateFamilyExposed, setImmediateFamilyExposed] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setCreatedAccount(null)

    try {
      const token = await getToken()

      const accountData = {
        contact: {
          email_address: email,
          phone_number: phone || undefined,
          street_address: [streetAddress],
          unit: unit || undefined,
          city,
          state,
          postal_code: postalCode,
          country: 'USA'
        },
        identity: {
          given_name: firstName,
          family_name: lastName,
          date_of_birth: dateOfBirth,
          tax_id: taxId,
          tax_id_type: 'USA_SSN',
          country_of_citizenship: 'USA',
          country_of_birth: 'USA',
          country_of_tax_residence: 'USA',
          funding_source: fundingSource
        },
        disclosures: {
          is_control_person: isControlPerson,
          is_affiliated_exchange_or_finra: isAffiliatedExchangeOrFinra,
          is_politically_exposed: isPoliticallyExposed,
          immediate_family_exposed: immediateFamilyExposed
        },
        agreements: [
          {
            agreement: 'customer_agreement',
            signed_at: new Date().toISOString(),
            ip_address: '127.0.0.1'
          },
          {
            agreement: 'margin_agreement',
            signed_at: new Date().toISOString(),
            ip_address: '127.0.0.1'
          }
        ]
      }

      const response = await fetch(`${API_BASE}/api/alpaca/accounts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(accountData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details?.message || 'Failed to create account')
      }

      setCreatedAccount(data.account)

      // Reset form
      setEmail('')
      setPhone('')
      setStreetAddress('')
      setUnit('')
      setCity('')
      setState('')
      setPostalCode('')
      setFirstName('')
      setLastName('')
      setDateOfBirth('')
      setTaxId('')
      setFundingSource(['employment_income'])
      setIsControlPerson(false)
      setIsAffiliatedExchangeOrFinra(false)
      setIsPoliticallyExposed(false)
      setImmediateFamilyExposed(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleFundingSource = (source: string) => {
    setFundingSource(prev =>
      prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source]
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 4,
    fontSize: 14,
    boxSizing: 'border-box'
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 6,
    color: '#333',
    display: 'block'
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: 24,
    padding: 16,
    background: '#f9f9f9',
    borderRadius: 8
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 16,
    color: '#111'
  }

  return (
    <>
      {createdAccount && (
        <div style={{
          background: '#d4edda',
          border: '1px solid #c3e6cb',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#155724' }}>
            Account Created Successfully
          </div>
          <div style={{ fontSize: 13, color: '#155724' }}>
            <div><strong>Account ID:</strong> {createdAccount.id}</div>
            <div><strong>Account Number:</strong> {createdAccount.accountNumber}</div>
            <div><strong>Status:</strong> {createdAccount.status}</div>
            <div><strong>Name:</strong> {createdAccount.firstName} {createdAccount.lastName}</div>
            <div><strong>Email:</strong> {createdAccount.email}</div>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          background: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          color: '#721c24'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Contact Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Email Address *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={inputStyle}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label style={labelStyle}>Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
                placeholder="+1234567890"
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Street Address *</label>
            <input
              type="text"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              required
              style={inputStyle}
              placeholder="123 Main St"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginTop: 16 }}>
            <div>
              <label style={labelStyle}>Unit/Apt</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={inputStyle}
                placeholder="Apt 4B"
              />
            </div>
            <div>
              <label style={labelStyle}>City *</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                style={inputStyle}
                placeholder="New York"
              />
            </div>
            <div>
              <label style={labelStyle}>State *</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
                style={inputStyle}
              >
                <option value="">Select...</option>
                {US_STATES.map(s => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Postal Code *</label>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                required
                style={inputStyle}
                placeholder="10001"
              />
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Identity Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                style={inputStyle}
                placeholder="John"
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                style={inputStyle}
                placeholder="Doe"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div>
              <label style={labelStyle}>Date of Birth *</label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>SSN (Tax ID) *</label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                required
                style={inputStyle}
                placeholder="123-45-6789"
                maxLength={11}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Funding Source(s) *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {FUNDING_SOURCES.map(source => (
                <button
                  key={source.value}
                  type="button"
                  onClick={() => toggleFundingSource(source.value)}
                  className={`toggle-btn ${fundingSource.includes(source.value) ? 'active' : ''}`}
                  style={{ fontSize: 12 }}
                >
                  {source.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Disclosures</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isControlPerson}
                onChange={(e) => setIsControlPerson(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>
                Is this person a control person (director, officer, or 10%+ shareholder of a public company)?
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isAffiliatedExchangeOrFinra}
                onChange={(e) => setIsAffiliatedExchangeOrFinra(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>
                Is this person affiliated with a stock exchange or FINRA member firm?
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isPoliticallyExposed}
                onChange={(e) => setIsPoliticallyExposed(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>
                Is this person a politically exposed person (PEP)?
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={immediateFamilyExposed}
                onChange={(e) => setImmediateFamilyExposed(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>
                Does this person have an immediate family member who is politically exposed?
              </span>
            </label>
          </div>
        </div>

        <div style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 8,
          padding: 12,
          marginBottom: 24,
          fontSize: 13,
          color: '#856404'
        }}>
          By submitting this form, you acknowledge that the customer agreement and margin agreement
          will be signed on behalf of the user. This is for testing purposes only.
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || fundingSource.length === 0}
          style={{ width: '100%', padding: '12px 16px', fontSize: 14 }}
        >
          {submitting ? 'Creating Account...' : 'Create Alpaca Account'}
        </button>
      </form>
    </>
  )
}

export default AlpacaAccountCreate
