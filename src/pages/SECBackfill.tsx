import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://zerosumserver.onrender.com'

interface BackfillJob {
  id: string
  type: string
  targetDate: string | null
  targetQuarter: string | null
  startDate: string | null
  endDate: string | null
  formTypes: string[] | null
  status: string
  progress: {
    processed: number
    total: number
    filingsAdded: number
    errors: Array<{ date: string; error: string }>
  }
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  createdAt: string
}

interface FilingStats {
  total: number
  oldestDate: string | null
  newestDate: string | null
  formTypeCounts: Array<{ form_type: string; count: number }>
}

interface BackfillStatus {
  stats: FilingStats
  activeJobs: BackfillJob[]
  availableRange: {
    earliest: string
    latest: string
  }
}

const FORM_TYPE_OPTIONS = [
  { value: '10-K', label: '10-K (Annual Report)' },
  { value: '10-Q', label: '10-Q (Quarterly Report)' },
  { value: '8-K', label: '8-K (Current Report)' },
  { value: '4', label: 'Form 4 (Insider Trading)' },
  { value: '13F', label: '13F (Institutional Holdings)' },
  { value: 'S-1', label: 'S-1 (Registration)' },
  { value: 'DEF 14A', label: 'DEF 14A (Proxy)' },
]

function SECBackfill() {
  const { getToken } = useAuth()
  const [status, setStatus] = useState<BackfillStatus | null>(null)
  const [jobs, setJobs] = useState<BackfillJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [jobType, setJobType] = useState<'daily' | 'range' | 'quarter'>('range')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [quarter, setQuarter] = useState('')
  const [selectedFormTypes, setSelectedFormTypes] = useState<string[]>([])

  const fetchStatus = useCallback(async () => {
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/sec/backfill/status`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch status')
      }

      const data = await response.json()
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    }
  }, [getToken])

  const fetchJobs = useCallback(async () => {
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/sec/backfill/jobs?limit=20`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch jobs')
      }

      const data = await response.json()
      setJobs(data.jobs)
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    }
  }, [getToken])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchStatus(), fetchJobs()])
      setLoading(false)
    }
    load()

    // Poll for updates every 5 seconds if there are active jobs
    const interval = setInterval(() => {
      if (status?.activeJobs && status.activeJobs.length > 0) {
        fetchStatus()
        fetchJobs()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [fetchStatus, fetchJobs, status?.activeJobs?.length])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const token = await getToken()

      const body: Record<string, unknown> = {
        type: jobType,
        formTypes: selectedFormTypes.length > 0 ? selectedFormTypes : null
      }

      if (jobType === 'daily') {
        body.targetDate = startDate
      } else if (jobType === 'range') {
        body.startDate = startDate
        body.endDate = endDate
      } else if (jobType === 'quarter') {
        body.quarter = quarter
      }

      const response = await fetch(`${API_BASE}/api/admin/sec/backfill`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to start backfill')
      }

      // Refresh data
      await Promise.all([fetchStatus(), fetchJobs()])

      // Reset form
      setStartDate('')
      setEndDate('')
      setQuarter('')
      setSelectedFormTypes([])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start backfill')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async (jobId: string) => {
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/sec/backfill/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Failed to cancel job')
      }

      await Promise.all([fetchStatus(), fetchJobs()])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel job')
    }
  }

  const toggleFormType = (formType: string) => {
    setSelectedFormTypes(prev =>
      prev.includes(formType)
        ? prev.filter(f => f !== formType)
        : [...prev, formType]
    )
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt) return '-'
    const start = new Date(startedAt).getTime()
    const end = completedAt ? new Date(completedAt).getTime() : Date.now()
    const seconds = Math.floor((end - start) / 1000)

    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  const getStatusColor = (jobStatus: string) => {
    switch (jobStatus) {
      case 'completed': return '#22c55e'
      case 'running': return '#3b82f6'
      case 'pending': return '#f59e0b'
      case 'failed': return '#ef4444'
      case 'cancelled': return '#6b7280'
      default: return '#6b7280'
    }
  }

  // Generate quarter options
  const generateQuarters = () => {
    const quarters = []
    const currentYear = new Date().getFullYear()
    for (let year = currentYear; year >= 2020; year--) {
      for (let q = 4; q >= 1; q--) {
        quarters.push(`${year}-Q${q}`)
      }
    }
    return quarters
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (error) {
    return (
      <div className="error">
        {error}
        <button className="btn btn-primary" onClick={() => window.location.reload()} style={{ marginLeft: 16 }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Stats Row */}
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Total Filings</div>
          <div className="stat-value">{status?.stats.total?.toLocaleString() || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Oldest Filing</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {formatDate(status?.stats.oldestDate || null)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Newest Filing</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {formatDate(status?.stats.newestDate || null)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Jobs</div>
          <div className="stat-value">{status?.activeJobs.length || 0}</div>
        </div>
      </div>

      {/* Form Type Breakdown */}
      {status?.stats.formTypeCounts && status.stats.formTypeCounts.length > 0 && (
        <div className="table-section">
          <div className="table-title">Filing Types in Database</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {status.stats.formTypeCounts.slice(0, 12).map(({ form_type, count }) => (
              <div
                key={form_type}
                style={{
                  padding: '6px 12px',
                  background: '#f5f5f5',
                  border: '1px solid #ddd',
                  fontSize: 12
                }}
              >
                <strong>{form_type}</strong>: {count.toLocaleString()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Backfill Job Form */}
      <div className="table-section">
        <div className="table-title">New Backfill Job</div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: '#666' }}>Job Type</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`toggle-btn ${jobType === 'daily' ? 'active' : ''}`}
                  onClick={() => setJobType('daily')}
                >
                  Single Day
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${jobType === 'range' ? 'active' : ''}`}
                  onClick={() => setJobType('range')}
                >
                  Date Range
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${jobType === 'quarter' ? 'active' : ''}`}
                  onClick={() => setJobType('quarter')}
                >
                  Full Quarter
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            {jobType === 'quarter' ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: '#666' }}>Quarter</div>
                <select
                  value={quarter}
                  onChange={(e) => setQuarter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    fontSize: 14,
                    minWidth: 150
                  }}
                  required
                >
                  <option value="">Select quarter</option>
                  {generateQuarters().map(q => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: '#666' }}>
                    {jobType === 'daily' ? 'Date' : 'Start Date'}
                  </div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    max={status?.availableRange.latest}
                    min={status?.availableRange.earliest}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #ddd',
                      fontSize: 14
                    }}
                    required
                  />
                </div>
                {jobType === 'range' && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: '#666' }}>End Date</div>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      max={status?.availableRange.latest}
                      min={startDate || status?.availableRange.earliest}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ddd',
                        fontSize: 14
                      }}
                      required
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: '#666' }}>
              Form Types (optional - leave empty for all)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {FORM_TYPE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`toggle-btn ${selectedFormTypes.includes(value) ? 'active' : ''}`}
                  onClick={() => toggleFormType(value)}
                  style={{ fontSize: 12 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Starting...' : 'Start Backfill'}
          </button>
        </form>
      </div>

      {/* Active Jobs */}
      {status?.activeJobs && status.activeJobs.length > 0 && (
        <div className="table-section">
          <div className="table-title">Active Jobs</div>
          {status.activeJobs.map(job => (
            <div
              key={job.id}
              style={{
                padding: 16,
                border: '1px solid #ddd',
                marginBottom: 12,
                background: '#fafafa'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <strong style={{ fontSize: 14 }}>
                    {job.type === 'daily' && `Daily: ${formatDate(job.targetDate)}`}
                    {job.type === 'range' && `Range: ${formatDate(job.startDate)} - ${formatDate(job.endDate)}`}
                    {job.type === 'quarter' && `Quarter: ${job.targetQuarter}`}
                  </strong>
                  {job.formTypes && (
                    <span style={{ marginLeft: 12, fontSize: 12, color: '#666' }}>
                      Forms: {job.formTypes.join(', ')}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      padding: '4px 8px',
                      background: getStatusColor(job.status),
                      color: '#fff',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      fontWeight: 600
                    }}
                  >
                    {job.status}
                  </span>
                  {(job.status === 'pending' || job.status === 'running') && (
                    <button
                      className="btn"
                      style={{ fontSize: 11, padding: '4px 8px' }}
                      onClick={() => handleCancel(job.id)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {job.progress && job.progress.total > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>Progress: {job.progress.processed} / {job.progress.total} days</span>
                    <span>Filings added: {job.progress.filingsAdded?.toLocaleString() || 0}</span>
                  </div>
                  <div style={{ height: 8, background: '#e5e5e5', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${(job.progress.processed / job.progress.total) * 100}%`,
                        background: '#333',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Job History */}
      <div className="table-section">
        <div className="table-title">Job History</div>
        {jobs.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Target</th>
                <th>Forms</th>
                <th>Status</th>
                <th>Filings</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id}>
                  <td style={{ fontSize: 12 }}>{formatDate(job.createdAt)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{job.type}</td>
                  <td style={{ fontSize: 12 }}>
                    {job.type === 'daily' && formatDate(job.targetDate)}
                    {job.type === 'range' && `${formatDate(job.startDate)} - ${formatDate(job.endDate)}`}
                    {job.type === 'quarter' && job.targetQuarter}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {job.formTypes ? job.formTypes.join(', ') : 'All'}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '2px 6px',
                        background: getStatusColor(job.status),
                        color: '#fff',
                        fontSize: 10,
                        textTransform: 'uppercase',
                        fontWeight: 600
                      }}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td>{job.progress?.filingsAdded?.toLocaleString() || 0}</td>
                  <td style={{ fontSize: 12 }}>{formatDuration(job.startedAt, job.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">No backfill jobs yet</div>
        )}
      </div>
    </>
  )
}

export default SECBackfill
