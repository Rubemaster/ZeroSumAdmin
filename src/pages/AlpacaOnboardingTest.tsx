import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://zerosumserver.onrender.com'

interface OnboardingUser {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  onboarding: {
    homeAddress?: {
      road?: string
      house_number?: string
      city?: string
      state?: string
      postcode?: string
      country?: string
    }
    personalInfo?: {
      dateOfBirth?: string
      countryOfBirth?: string
      countryOfCitizenship?: string
      taxId?: string
      taxIdType?: string
    }
    disclosures?: {
      isOfficerOrDirector?: boolean
      isAffiliatedWithExchange?: boolean
      isPoliticallyExposed?: boolean
      hasFamilyPoliticallyExposed?: boolean
    }
    employmentInfo?: {
      status?: string
    }
    agreements?: {
      acceptsAlpacaMarginAgreement?: boolean
      acceptsTermsOfService?: boolean
    }
    completedAt?: string
  }
  hasCompletedOnboarding: boolean
}

interface AlpacaResponse {
  id: string
  account_number: string
  status: string
  contact?: {
    email_address?: string
    phone_number?: string
    street_address?: string[]
    unit?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
  identity?: {
    given_name?: string
    family_name?: string
    date_of_birth?: string
    tax_id?: string
    tax_id_type?: string
    country_of_citizenship?: string
    country_of_birth?: string
    country_of_tax_residence?: string
    funding_source?: string[]
  }
  disclosures?: {
    is_control_person?: boolean
    is_affiliated_exchange_or_finra?: boolean
    is_politically_exposed?: boolean
    immediate_family_exposed?: boolean
  }
}

interface FieldMapping {
  alpacaField: string
  onboardingPath: string
  formValue: string | boolean | null | undefined
  alpacaValue?: string | boolean | null | undefined
}

function AlpacaOnboardingTest() {
  const { getToken } = useAuth()
  const [users, setUsers] = useState<OnboardingUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alpacaResponse, setAlpacaResponse] = useState<AlpacaResponse | null>(null)
  const [creationStatus, setCreationStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/users/with-onboarding`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }

      const data = await response.json()
      setUsers(data.users || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const selectedUser = users.find(u => u.id === selectedUserId)

  const buildAlpacaPayload = (user: OnboardingUser) => {
    const { onboarding } = user
    return {
      contact: {
        email_address: user.email,
        phone_number: user.phone || undefined,
        street_address: onboarding.homeAddress?.road ? [onboarding.homeAddress.road] : undefined,
        unit: onboarding.homeAddress?.house_number || undefined,
        city: onboarding.homeAddress?.city,
        state: onboarding.homeAddress?.state,
        postal_code: onboarding.homeAddress?.postcode,
        country: onboarding.homeAddress?.country || 'USA'
      },
      identity: {
        given_name: user.firstName,
        family_name: user.lastName,
        date_of_birth: onboarding.personalInfo?.dateOfBirth,
        tax_id: onboarding.personalInfo?.taxId,
        tax_id_type: onboarding.personalInfo?.taxIdType || 'USA_SSN',
        country_of_citizenship: onboarding.personalInfo?.countryOfCitizenship || 'USA',
        country_of_birth: onboarding.personalInfo?.countryOfBirth || 'USA',
        country_of_tax_residence: onboarding.homeAddress?.country || 'USA',
        funding_source: [onboarding.employmentInfo?.status === 'employed' ? 'employment_income' : 'savings']
      },
      disclosures: {
        is_control_person: onboarding.disclosures?.isOfficerOrDirector || false,
        is_affiliated_exchange_or_finra: onboarding.disclosures?.isAffiliatedWithExchange || false,
        is_politically_exposed: onboarding.disclosures?.isPoliticallyExposed || false,
        immediate_family_exposed: onboarding.disclosures?.hasFamilyPoliticallyExposed || false
      },
      agreements: [
        { agreement: 'customer_agreement', signed_at: new Date().toISOString(), ip_address: '127.0.0.1' },
        { agreement: 'margin_agreement', signed_at: new Date().toISOString(), ip_address: '127.0.0.1' }
      ]
    }
  }

  const getFieldMappings = (user: OnboardingUser): FieldMapping[] => {
    const { onboarding } = user
    const response = alpacaResponse

    return [
      // Contact fields
      { alpacaField: 'contact.email_address', onboardingPath: '(Clerk email)', formValue: user.email, alpacaValue: response?.contact?.email_address },
      { alpacaField: 'contact.phone_number', onboardingPath: '(Clerk phone)', formValue: user.phone, alpacaValue: response?.contact?.phone_number },
      { alpacaField: 'contact.street_address', onboardingPath: 'homeAddress.road', formValue: onboarding.homeAddress?.road, alpacaValue: response?.contact?.street_address?.[0] },
      { alpacaField: 'contact.unit', onboardingPath: 'homeAddress.house_number', formValue: onboarding.homeAddress?.house_number, alpacaValue: response?.contact?.unit },
      { alpacaField: 'contact.city', onboardingPath: 'homeAddress.city', formValue: onboarding.homeAddress?.city, alpacaValue: response?.contact?.city },
      { alpacaField: 'contact.state', onboardingPath: 'homeAddress.state', formValue: onboarding.homeAddress?.state, alpacaValue: response?.contact?.state },
      { alpacaField: 'contact.postal_code', onboardingPath: 'homeAddress.postcode', formValue: onboarding.homeAddress?.postcode, alpacaValue: response?.contact?.postal_code },
      { alpacaField: 'contact.country', onboardingPath: 'homeAddress.country', formValue: onboarding.homeAddress?.country || 'USA', alpacaValue: response?.contact?.country },

      // Identity fields
      { alpacaField: 'identity.given_name', onboardingPath: '(Clerk firstName)', formValue: user.firstName, alpacaValue: response?.identity?.given_name },
      { alpacaField: 'identity.family_name', onboardingPath: '(Clerk lastName)', formValue: user.lastName, alpacaValue: response?.identity?.family_name },
      { alpacaField: 'identity.date_of_birth', onboardingPath: 'personalInfo.dateOfBirth', formValue: onboarding.personalInfo?.dateOfBirth, alpacaValue: response?.identity?.date_of_birth },
      { alpacaField: 'identity.tax_id', onboardingPath: 'personalInfo.taxId', formValue: maskTaxId(onboarding.personalInfo?.taxId), alpacaValue: maskTaxId(response?.identity?.tax_id) },
      { alpacaField: 'identity.tax_id_type', onboardingPath: 'personalInfo.taxIdType', formValue: onboarding.personalInfo?.taxIdType || 'USA_SSN', alpacaValue: response?.identity?.tax_id_type },
      { alpacaField: 'identity.country_of_citizenship', onboardingPath: 'personalInfo.countryOfCitizenship', formValue: onboarding.personalInfo?.countryOfCitizenship || 'USA', alpacaValue: response?.identity?.country_of_citizenship },
      { alpacaField: 'identity.country_of_birth', onboardingPath: 'personalInfo.countryOfBirth', formValue: onboarding.personalInfo?.countryOfBirth || 'USA', alpacaValue: response?.identity?.country_of_birth },
      { alpacaField: 'identity.country_of_tax_residence', onboardingPath: 'homeAddress.country', formValue: onboarding.homeAddress?.country || 'USA', alpacaValue: response?.identity?.country_of_tax_residence },
      { alpacaField: 'identity.funding_source', onboardingPath: 'employmentInfo.status', formValue: onboarding.employmentInfo?.status === 'employed' ? 'employment_income' : 'savings', alpacaValue: response?.identity?.funding_source?.[0] },

      // Disclosures
      { alpacaField: 'disclosures.is_control_person', onboardingPath: 'disclosures.isOfficerOrDirector', formValue: onboarding.disclosures?.isOfficerOrDirector || false, alpacaValue: response?.disclosures?.is_control_person },
      { alpacaField: 'disclosures.is_affiliated_exchange_or_finra', onboardingPath: 'disclosures.isAffiliatedWithExchange', formValue: onboarding.disclosures?.isAffiliatedWithExchange || false, alpacaValue: response?.disclosures?.is_affiliated_exchange_or_finra },
      { alpacaField: 'disclosures.is_politically_exposed', onboardingPath: 'disclosures.isPoliticallyExposed', formValue: onboarding.disclosures?.isPoliticallyExposed || false, alpacaValue: response?.disclosures?.is_politically_exposed },
      { alpacaField: 'disclosures.immediate_family_exposed', onboardingPath: 'disclosures.hasFamilyPoliticallyExposed', formValue: onboarding.disclosures?.hasFamilyPoliticallyExposed || false, alpacaValue: response?.disclosures?.immediate_family_exposed },
    ]
  }

  const maskTaxId = (taxId: string | undefined | null): string | undefined => {
    if (!taxId) return undefined
    if (taxId.length < 4) return '***'
    return '***-**-' + taxId.slice(-4)
  }

  const formatValue = (value: string | boolean | null | undefined): string => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    return String(value)
  }

  const handleCreateAccount = async () => {
    if (!selectedUser) return

    setSubmitting(true)
    setError(null)
    setCreationStatus('idle')
    setAlpacaResponse(null)

    try {
      const token = await getToken()
      const payload = buildAlpacaPayload(selectedUser)

      const response = await fetch(`${API_BASE}/api/alpaca/accounts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.details?.message || 'Failed to create account')
      }

      // Fetch full account details to compare
      const accountResponse = await fetch(`${API_BASE}/api/alpaca/accounts/${data.account.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (accountResponse.ok) {
        const fullAccount = await accountResponse.json()
        setAlpacaResponse(fullAccount.account || fullAccount)
      } else {
        // Use the creation response if we can't get full details
        setAlpacaResponse({
          id: data.account.id,
          account_number: data.account.accountNumber,
          status: data.account.status,
          contact: { email_address: data.account.email },
          identity: { given_name: data.account.firstName, family_name: data.account.lastName }
        })
      }

      setCreationStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
      setCreationStatus('error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId)
    setAlpacaResponse(null)
    setCreationStatus('idle')
    setError(null)
  }

  if (loading) {
    return <div className="loading">Loading users with onboarding data...</div>
  }

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
          Select a user with onboarding data to view the field mapping and test Alpaca account creation.
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <select
            value={selectedUserId}
            onChange={(e) => handleUserChange(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: 14,
              minWidth: 350
            }}
          >
            <option value="">Select a user...</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.email || 'No email'} - {user.firstName} {user.lastName}
                {user.hasCompletedOnboarding ? ' (completed)' : ' (in progress)'}
              </option>
            ))}
          </select>

          {users.length === 0 && (
            <span style={{ color: '#999', fontSize: 13 }}>No users with onboarding data found</span>
          )}
        </div>
      </div>

      {selectedUser && (
        <>
          <div className="table-section">
            <div className="table-title">Field Mapping</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Alpaca Field</th>
                  <th>Onboarding Path</th>
                  <th>Form Value</th>
                  <th>Alpaca Value</th>
                </tr>
              </thead>
              <tbody>
                {getFieldMappings(selectedUser).map((mapping, idx) => {
                  const formStr = formatValue(mapping.formValue)
                  const alpacaStr = formatValue(mapping.alpacaValue)
                  const mismatch = alpacaResponse && alpacaStr !== '-' && formStr !== alpacaStr

                  return (
                    <tr key={idx} style={mismatch ? { background: '#fff3cd' } : undefined}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{mapping.alpacaField}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}>{mapping.onboardingPath}</td>
                      <td style={{ fontSize: 13 }}>{formStr}</td>
                      <td style={{
                        fontSize: 13,
                        color: alpacaResponse ? (mismatch ? '#856404' : '#155724') : '#999'
                      }}>
                        {alpacaStr}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {error && (
            <div style={{
              background: '#f8d7da',
              border: '1px solid #f5c6cb',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16,
              color: '#721c24'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {creationStatus === 'success' && alpacaResponse && (
            <div style={{
              background: '#d4edda',
              border: '1px solid #c3e6cb',
              borderRadius: 8,
              padding: 16,
              marginBottom: 16
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#155724' }}>
                Account Created Successfully
              </div>
              <div style={{ fontSize: 13, color: '#155724' }}>
                <strong>Account ID:</strong> {alpacaResponse.id} &nbsp;&nbsp;
                <strong>Account Number:</strong> {alpacaResponse.account_number} &nbsp;&nbsp;
                <strong>Status:</strong> {alpacaResponse.status}
              </div>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleCreateAccount}
            disabled={submitting}
            style={{ padding: '12px 24px', fontSize: 14 }}
          >
            {submitting ? 'Creating Account...' : 'Create Alpaca Account'}
          </button>

          <div style={{
            marginTop: 16,
            padding: 12,
            background: '#f8f9fa',
            borderRadius: 4,
            fontSize: 12,
            color: '#666'
          }}>
            After account creation, the "Alpaca Value" column will populate with data from the response.
            Yellow highlighted rows indicate mismatches between sent and received values.
          </div>
        </>
      )}
    </>
  )
}

export default AlpacaOnboardingTest
