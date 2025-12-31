import { useState, useRef, useCallback, useEffect } from 'react'
import { useAuth } from '@clerk/clerk-react'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://zerosumserver.onrender.com'

// Unix epoch reference: 1970-01-01
const EPOCH = Date.UTC(1970, 0, 1)
const MS_PER_DAY = 86400000

interface ProcessingStats {
  rowsProcessed: number
  companiesFound: number
  formTypesFound: number
  extensionsFound: number
  errors: string[]
  bytesRead: number
  totalBytes: number
  elapsedTime: number
}

interface ImportJob {
  jobId: string
  status: 'pending' | 'uploading' | 'ready' | 'running' | 'paused' | 'completed' | 'failed'
  progress?: number
  totalChunks?: number
  currentChunk?: number
  linesImported?: number
  error?: string
}

interface PreparedImportData {
  formTypes: Array<{ id: number; code: string }>
  extensions: Array<{ id: number; ext: string }>
  companies: Array<{ cik: number; name: string }>
  filings: Array<{
    cik: number
    form_type_id: number
    filed_date: number
    accession_filer: number
    accession_seq: number
    ext_id: number
  }>
}

interface SetupStatus {
  tablesExist: boolean
  configured: boolean
  sec_filings_v2?: boolean
  sec_companies?: boolean
  sec_form_types?: boolean
  sec_file_extensions?: boolean
  error?: string
}

interface DbStats {
  filings: number
  companies: number
  formTypes: number
}

function SECDailyIndices() {
  const { getToken } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [processing, setProcessing] = useState(false)
  const [stats, setStats] = useState<ProcessingStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [dbStats, setDbStats] = useState<DbStats | null>(null)
  const [connectionString, setConnectionString] = useState('')
  const [settingUp, setSettingUp] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewInputRef = useRef<HTMLInputElement>(null)
  const [previewLines, setPreviewLines] = useState<string[] | null>(null)
  const [previewFileName, setPreviewFileName] = useState<string | null>(null)
  const [testMode, setTestMode] = useState(false)
  const [testRowLimit, setTestRowLimit] = useState(10000)
  const [fileRowCount, setFileRowCount] = useState<number | null>(null)
  const [counting, setCounting] = useState(false)
  const [importJob, setImportJob] = useState<ImportJob | null>(null)
  const [generatedSQL, setGeneratedSQL] = useState<string | null>(null)
  const [preparedImport, setPreparedImport] = useState<PreparedImportData | null>(null)
  const uploadAbortRef = useRef(false)
  const [chunkSize, setChunkSize] = useState(5000)
  const [startChunk, setStartChunk] = useState(0)
  const [hoveredChunk, setHoveredChunk] = useState<number | null>(null)
  const [selectedChunk, setSelectedChunk] = useState<number | null>(null)
  const [autoUpload, setAutoUpload] = useState(true)
  const [idMappings, setIdMappings] = useState<{ formTypeIdMap: Record<number, number>, extIdMap: Record<number, number> } | null>(null)
  const [uploadedCounts, setUploadedCounts] = useState<{ formTypes: number, extensions: number, companies: number, filings: number }>({ formTypes: 0, extensions: 0, companies: 0, filings: 0 })

  // Check setup status on mount
  useEffect(() => {
    checkSetupStatus()
  }, [])

  // Auto-process file when counting completes
  useEffect(() => {
    if (file && fileRowCount !== null && !counting && !processing && !preparedImport) {
      processFile()
    }
  }, [fileRowCount, counting])

  const checkSetupStatus = async () => {
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/sec/filings/setup-status`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      setSetupStatus(data)

      if (data.tablesExist) {
        fetchDbStats()
      }
    } catch (err) {
      console.error('Failed to check setup status:', err)
    }
  }

  const fetchDbStats = async () => {
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/sec/filings/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()
      setDbStats(data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  const handleSetup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    // Only require connection string if not already configured
    if (!setupStatus?.configured && !connectionString) return

    setSettingUp(true)
    try {
      const token = await getToken()
      const response = await fetch(`${API_BASE}/api/admin/sec/filings/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ connectionString: connectionString || undefined })
      })

      const data = await response.json()
      if (data.success) {
        setConnectionString('')
        await checkSetupStatus()
      } else {
        setError(data.error || 'Failed to setup tables')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup tables')
    } finally {
      setSettingUp(false)
    }
  }


  // Helper to get readable stream, decompressing if gzip
  const getFileStream = (file: File): ReadableStream<Uint8Array> => {
    const stream = file.stream()
    if (file.name.endsWith('.gz')) {
      return stream.pipeThrough(new DecompressionStream('gzip'))
    }
    return stream
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setStats(null)
    setError(null)
    setFileRowCount(null)
    setCounting(true)

    // Pass 1: Stream file and count data rows (decompress if .gz)
    try {
      const stream = getFileStream(selectedFile)
      const reader = stream.getReader()
      const decoder = new TextDecoder()

      let buffer = ''
      let rowCount = 0
      let headerSkipped = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          // Skip header lines
          if (!headerSkipped) {
            if (line.startsWith('CIK|') || line.includes('---') || line.trim() === '') {
              continue
            }
            if (line.includes('|') && /^\d+\|/.test(line)) {
              headerSkipped = true
            } else {
              continue
            }
          }

          // Count data rows
          if (line.includes('|') && /^\d+\|/.test(line)) {
            rowCount++
          }
        }
      }

      // Count remaining buffer
      if (buffer && buffer.includes('|') && /^\d+\|/.test(buffer)) {
        rowCount++
      }

      setFileRowCount(rowCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to count rows')
    } finally {
      setCounting(false)
    }
  }

  const handlePreviewFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setPreviewFileName(selectedFile.name)
    setPreviewLines(null)

    const lines: string[] = []
    const stream = selectedFile.stream()
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (lines.length < 50) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n')
        buffer = parts.pop() || ''

        for (const line of parts) {
          lines.push(line)
          if (lines.length >= 50) break
        }
      }

      // Add remaining buffer if we haven't hit 50 lines
      if (buffer && lines.length < 50) {
        lines.push(buffer)
      }

      setPreviewLines(lines.slice(0, 50))
    } catch (err) {
      setPreviewLines([`Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`])
    } finally {
      reader.releaseLock()
    }
  }

  // Parse accession number: edgar/data/1000275/0000950103-25-012593.txt
  // Returns: { filer: 950103, seq: 12593, ext: 'txt' }
  // Year is derived from filed_date in the database view
  const parseAccession = (filePath: string) => {
    // Extract filename from path
    const parts = filePath.split('/')
    const filename = parts[parts.length - 1]

    // Parse: 0000950103-25-012593.txt
    const match = filename.match(/^(\d+)-(\d+)-(\d+)\.(\w+)$/)
    if (!match) return null

    return {
      filer: parseInt(match[1], 10),
      seq: parseInt(match[3], 10),
      ext: match[4]
    }
  }

  // Convert YYYYMMDD to days since epoch
  const dateToDays = (yyyymmdd: string): number => {
    const year = parseInt(yyyymmdd.substring(0, 4), 10)
    const month = parseInt(yyyymmdd.substring(4, 6), 10) - 1
    const day = parseInt(yyyymmdd.substring(6, 8), 10)
    const date = Date.UTC(year, month, day)
    return Math.floor((date - EPOCH) / MS_PER_DAY)
  }

  const processFile = useCallback(async () => {
    if (!file) return

    setProcessing(true)
    setStats(null)
    setError(null)

    const startTime = performance.now()

    const currentStats: ProcessingStats = {
      rowsProcessed: 0,
      companiesFound: 0,
      formTypesFound: 0,
      extensionsFound: 0,
      errors: [],
      bytesRead: 0,
      totalBytes: file.size,
      elapsedTime: 0
    }

    // Row limit for test mode
    const rowLimit = testMode ? testRowLimit : Infinity

    // Track unique values with auto-incrementing IDs
    const formTypes: Map<string, number> = new Map()
    const extensions: Map<string, number> = new Map()
    const companies: Map<number, string> = new Map()

    // Data rows (tab-separated for SQL COPY format)
    const filingsRows: string[] = []

    try {
      // Decompress if .gz file
      const stream = getFileStream(file)
      const reader = stream.getReader()
      const decoder = new TextDecoder()

      let buffer = ''
      let headerSkipped = false
      let reachedLimit = false

      while (true) {
        if (reachedLimit) break

        const { done, value } = await reader.read()
        if (done) break

        if (value) {
          currentStats.bytesRead += value.length
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (currentStats.rowsProcessed >= rowLimit) {
            reachedLimit = true
            break
          }

          // Skip header lines
          if (!headerSkipped) {
            if (line.startsWith('CIK|') || line.includes('---') || line.trim() === '') {
              continue
            }
            if (line.includes('|') && /^\d+\|/.test(line)) {
              headerSkipped = true
            } else {
              continue
            }
          }

          if (!line.includes('|') || !/^\d+\|/.test(line)) continue

          const parts = line.split('|')
          if (parts.length < 5) continue

          const cik = parseInt(parts[0], 10)
          const companyName = parts[1].trim()
          const formType = parts[2].trim()
          const dateFiled = parts[3].trim()
          const filePath = parts[4].trim()

          const accession = parseAccession(filePath)
          if (!accession) continue

          // Track company
          if (!companies.has(cik)) {
            companies.set(cik, companyName)
            currentStats.companiesFound++
          }

          // Track form type with auto-increment ID
          if (!formTypes.has(formType)) {
            formTypes.set(formType, formTypes.size + 1)
            currentStats.formTypesFound++
          }

          // Track extension with auto-increment ID
          if (!extensions.has(accession.ext)) {
            extensions.set(accession.ext, extensions.size + 1)
            currentStats.extensionsFound++
          }

          const formTypeId = formTypes.get(formType)!
          const extId = extensions.get(accession.ext)!
          const filedDate = dateToDays(dateFiled)

          // Add filing row (tab-separated for COPY format)
          filingsRows.push(`${cik}\t${formTypeId}\t${filedDate}\t${accession.filer}\t${accession.seq}\t${extId}`)

          currentStats.rowsProcessed++

          // Update UI periodically
          if (currentStats.rowsProcessed % 10000 === 0) {
            currentStats.elapsedTime = performance.now() - startTime
            setStats({ ...currentStats })
          }
        }
      }

      currentStats.elapsedTime = performance.now() - startTime
      setStats({ ...currentStats })

      // Prepare structured data for chunked upload
      const preparedData: PreparedImportData = {
        formTypes: Array.from(formTypes.entries()).map(([code, id]) => ({ id, code })),
        extensions: Array.from(extensions.entries()).map(([ext, id]) => ({ id, ext })),
        companies: Array.from(companies.entries()).map(([cik, name]) => ({ cik, name })),
        filings: filingsRows.map(row => {
          const [cik, formTypeId, filedDate, filer, seq, extId] = row.split('\t')
          return {
            cik: parseInt(cik, 10),
            form_type_id: parseInt(formTypeId, 10),
            filed_date: parseInt(filedDate, 10),
            accession_filer: parseInt(filer, 10),
            accession_seq: parseInt(seq, 10),
            ext_id: parseInt(extId, 10)
          }
        })
      }

      setPreparedImport(preparedData)

      setImportJob({
        jobId: '',
        status: 'pending',
        currentChunk: 0
      })

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file')
      currentStats.errors.push(err instanceof Error ? err.message : 'Unknown error')
      currentStats.elapsedTime = performance.now() - startTime
      setStats({ ...currentStats })
    } finally {
      setProcessing(false)
    }
  }, [file, testMode, testRowLimit])

  // Upload a single chunk and return whether there are more chunks
  const uploadSingleChunk = async (chunkNum: number, totalInsertedSoFar: number): Promise<{ success: boolean, inserted: number, hasMore: boolean }> => {
    if (!preparedImport) return { success: false, inserted: 0, hasMore: false }

    const CHUNK_SIZE = chunkSize
    const token = await getToken()
    const companyChunks = Math.ceil(preparedImport.companies.length / CHUNK_SIZE)
    const filingChunks = Math.ceil(preparedImport.filings.length / CHUNK_SIZE)
    const totalChunks = 1 + companyChunks + filingChunks

    try {
      if (chunkNum === 1) {
        // Chunk 1: Form types and extensions
        const response = await fetch(`${API_BASE}/api/admin/sec/filings/bulk-insert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            formTypes: preparedImport.formTypes.map(ft => ft.code),
            extensions: preparedImport.extensions.map(ext => ext.ext),
            companies: [],
            filings: []
          })
        })
        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || 'Failed to upload form types and extensions')
        }
        const setupData = await response.json()
        const serverFormTypeMap: Record<string, number> = setupData.formTypeMap || {}
        const serverExtMap: Record<string, number> = setupData.extensionMap || {}

        // Build and store ID mappings
        const formTypeIdMap: Record<number, number> = {}
        for (const ft of preparedImport.formTypes) {
          if (serverFormTypeMap[ft.code]) formTypeIdMap[ft.id] = serverFormTypeMap[ft.code]
        }
        const extIdMap: Record<number, number> = {}
        for (const ext of preparedImport.extensions) {
          if (serverExtMap[ext.ext]) extIdMap[ext.id] = serverExtMap[ext.ext]
        }
        setIdMappings({ formTypeIdMap, extIdMap })
        setUploadedCounts(prev => ({
          ...prev,
          formTypes: Object.keys(serverFormTypeMap).length,
          extensions: Object.keys(serverExtMap).length
        }))
        return { success: true, inserted: 0, hasMore: chunkNum < totalChunks }
      } else if (chunkNum <= 1 + companyChunks) {
        // Company chunks
        const companyChunkIndex = chunkNum - 2
        const start = companyChunkIndex * CHUNK_SIZE
        const chunk = preparedImport.companies.slice(start, start + CHUNK_SIZE)
        const response = await fetch(`${API_BASE}/api/admin/sec/filings/bulk-insert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ formTypes: [], extensions: [], companies: chunk, filings: [] })
        })
        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || `Failed to upload companies chunk ${chunkNum}`)
        }
        setUploadedCounts(prev => ({
          ...prev,
          companies: prev.companies + chunk.length
        }))
        return { success: true, inserted: 0, hasMore: chunkNum < totalChunks }
      } else {
        // Filing chunks
        if (!idMappings) throw new Error('ID mappings not available - run chunk 1 first')
        const filingChunkIndex = chunkNum - 2 - companyChunks
        const start = filingChunkIndex * CHUNK_SIZE
        const chunk = preparedImport.filings.slice(start, start + CHUNK_SIZE).map(f => ({
          ...f,
          form_type_id: idMappings.formTypeIdMap[f.form_type_id] || f.form_type_id,
          ext_id: idMappings.extIdMap[f.ext_id] || f.ext_id
        }))
        const response = await fetch(`${API_BASE}/api/admin/sec/filings/bulk-insert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ formTypes: [], extensions: [], companies: [], filings: chunk })
        })
        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || `Failed to upload filings chunk ${chunkNum}`)
        }
        const data = await response.json()
        const inserted = data.inserted || chunk.length
        setUploadedCounts(prev => ({
          ...prev,
          filings: prev.filings + inserted
        }))
        return { success: true, inserted, hasMore: chunkNum < totalChunks }
      }
    } catch (err) {
      throw err
    }
  }

  // Chunked upload - uploads data in batches with progress tracking
  const runChunkedUpload = async (fromChunk = 0) => {
    if (!preparedImport) return

    uploadAbortRef.current = false
    // Reset counts if starting fresh
    if (fromChunk <= 1) {
      setUploadedCounts({ formTypes: 0, extensions: 0, companies: 0, filings: 0 })
    }
    const CHUNK_SIZE = chunkSize
    const companyChunks = Math.ceil(preparedImport.companies.length / CHUNK_SIZE)
    const filingChunks = Math.ceil(preparedImport.filings.length / CHUNK_SIZE)
    const totalChunks = 1 + companyChunks + filingChunks
    let currentChunkNum = fromChunk > 0 ? fromChunk : 1
    let totalInserted = importJob?.linesImported || 0

    console.log('[Upload] Starting chunked upload:', { totalChunks, startingFromChunk: currentChunkNum, autoUpload })

    setImportJob(prev => ({
      ...prev!,
      jobId: 'chunked',
      status: 'running',
      totalChunks,
      currentChunk: currentChunkNum,
      linesImported: totalInserted
    }))

    try {
      while (currentChunkNum <= totalChunks) {
        if (uploadAbortRef.current) {
          throw new Error('Upload stopped by user')
        }

        setImportJob(prev => ({
          ...prev!,
          currentChunk: currentChunkNum,
          status: 'running',
          progress: Math.round((currentChunkNum / totalChunks) * 100)
        }))

        console.log(`[Upload] Chunk ${currentChunkNum}/${totalChunks}`)
        const result = await uploadSingleChunk(currentChunkNum, totalInserted)
        totalInserted += result.inserted

        setImportJob(prev => ({
          ...prev!,
          linesImported: totalInserted
        }))

        if (!result.hasMore) {
          // Done!
          console.log('[Upload] Complete! Total inserted:', totalInserted)
          setImportJob({
            jobId: 'chunked',
            status: 'completed',
            totalChunks,
            currentChunk: totalChunks,
            linesImported: totalInserted,
            progress: 100
          })
          setGeneratedSQL(null)
          setPreparedImport(null)
          setIdMappings(null)
          fetchDbStats()
          return
        }

        currentChunkNum++

        // In manual mode, pause after each chunk
        if (!autoUpload && currentChunkNum <= totalChunks) {
          setImportJob(prev => ({
            ...prev!,
            status: 'paused',
            currentChunk: currentChunkNum - 1, // Show last completed chunk
            linesImported: totalInserted
          }))
          setStartChunk(currentChunkNum) // Set next chunk to resume from
          return
        }

        // Small delay for UI updates in auto mode
        await new Promise(r => setTimeout(r, 10))
      }
    } catch (err) {
      console.error('[Upload] Error:', err)
      setImportJob(prev => ({
        ...prev!,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Upload failed'
      }))
    }
  }

  // Stop the upload
  const stopUpload = () => {
    console.log('[Upload] Stop requested')
    uploadAbortRef.current = true
  }

  // Cancel/cleanup import job
  const cancelImport = async () => {
    setImportJob(null)
    setPreparedImport(null)
    setGeneratedSQL(null)
    setIdMappings(null)
    setStartChunk(0)
    setSelectedChunk(null)
    setUploadedCounts({ formTypes: 0, extensions: 0, companies: 0, filings: 0 })
  }

  const dbConfigured = setupStatus?.tablesExist ?? false

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>SEC Master Index Processor</h2>
        <p style={{ color: '#666', fontSize: 13 }}>
          Upload a master.idx file to import SEC filings. Format: CIK|Company Name|Form Type|Date Filed|File Name
        </p>
      </div>

      {/* File Preview Tool */}
      <div style={{
        marginBottom: 24,
        padding: 16,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>File Preview (First 50 Lines)</div>
        <input
          ref={previewInputRef}
          type="file"
          onChange={handlePreviewFile}
          style={{ display: 'none' }}
        />
        <button
          className="btn"
          onClick={() => previewInputRef.current?.click()}
          style={{ marginBottom: 12 }}
        >
          Select Any File to Preview
        </button>
        {previewFileName && (
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            Previewing: <strong>{previewFileName}</strong>
          </div>
        )}
        {previewLines && (
          <pre style={{
            background: '#1e293b',
            color: '#e2e8f0',
            padding: 12,
            borderRadius: 4,
            fontSize: 11,
            fontFamily: 'monospace',
            overflow: 'auto',
            maxHeight: 400,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {previewLines.map((line, i) => (
              <div key={i}>
                <span style={{ color: '#64748b', marginRight: 8 }}>{String(i + 1).padStart(2, ' ')}:</span>
                {line}
              </div>
            ))}
          </pre>
        )}
      </div>

      {/* Setup Banner */}
      {!dbConfigured && (
        <div style={{
          marginBottom: 24,
          padding: 16,
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: 8
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Database Setup Required</div>
          {setupStatus?.configured ? (
            // Connection exists but tables don't - just show create button
            <>
              <p style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
                Database connection found. Click below to create the optimized filings tables.
              </p>
              <button
                className="btn btn-primary"
                onClick={handleSetup}
                disabled={settingUp}
              >
                {settingUp ? 'Setting up...' : 'Create Tables'}
              </button>
            </>
          ) : (
            // No connection stored - show input form
            <>
              <p style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
                Enter your PostgreSQL connection string to create the optimized filings tables.
              </p>
              <form onSubmit={handleSetup} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  placeholder="postgresql://postgres:PASSWORD@host:5432/postgres"
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #ddd',
                    fontSize: 12,
                    fontFamily: 'monospace'
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={settingUp || !connectionString}
                >
                  {settingUp ? 'Setting up...' : 'Setup Tables'}
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Stats Row */}
      {dbConfigured && dbStats && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 24, fontSize: 13 }}>
          <div>
            <span style={{ color: '#666' }}>Filings:</span>{' '}
            <strong>{dbStats.filings.toLocaleString()}</strong>
          </div>
          <div>
            <span style={{ color: '#666' }}>Companies:</span>{' '}
            <strong>{dbStats.companies.toLocaleString()}</strong>
          </div>
          <div>
            <span style={{ color: '#666' }}>Form Types:</span>{' '}
            <strong>{dbStats.formTypes.toLocaleString()}</strong>
          </div>
        </div>
      )}

      {/* File Upload */}
      {dbConfigured && (
        <>
          <div style={{
            padding: 24,
            border: '2px dashed #ddd',
            borderRadius: 8,
            textAlign: 'center',
            marginBottom: 24
          }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".idx,.gz,.txt"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              style={{ marginBottom: 12 }}
            >
              Select Master Index File (.idx, .gz)
            </button>
            {file ? (
              <div style={{ fontSize: 13, color: '#666' }}>
                Selected: <strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB)
                {file.name.endsWith('.gz') && <span style={{ marginLeft: 8, color: '#3b82f6' }}>(gzip)</span>}
                {counting && <span style={{ marginLeft: 8 }}>Counting rows...</span>}
                {fileRowCount !== null && !counting && !processing && (
                  <span style={{ marginLeft: 8 }}>
                    — <strong>{fileRowCount.toLocaleString()}</strong> data rows
                  </span>
                )}
                {processing && <span style={{ marginLeft: 8 }}>Processing...</span>}
                {' '}
                (Mode:{' '}
                <span
                  onClick={() => setTestMode(!testMode)}
                  style={{
                    cursor: 'pointer',
                    color: '#3b82f6',
                    textDecoration: 'underline'
                  }}
                >
                  {testMode ? `Test: ${testRowLimit.toLocaleString()} rows` : 'Complete Run'}
                </span>)
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#666' }}>
                (Mode:{' '}
                <span
                  onClick={() => setTestMode(!testMode)}
                  style={{
                    cursor: 'pointer',
                    color: '#3b82f6',
                    textDecoration: 'underline'
                  }}
                >
                  {testMode ? `Test: ${testRowLimit.toLocaleString()} rows` : 'Complete Run'}
                </span>)
              </div>
            )}
          </div>
        </>
      )}

      {/* Processing Progress - only show while actively processing */}
      {processing && stats && stats.totalBytes > 0 && (
        <div style={{
          padding: 16,
          background: '#f5f5f5',
          border: '1px solid #ddd',
          borderRadius: 8,
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>Processing: {((stats.bytesRead / stats.totalBytes) * 100).toFixed(1)}%</span>
            <span>{(stats.bytesRead / 1024 / 1024).toFixed(1)} / {(stats.totalBytes / 1024 / 1024).toFixed(1)} MB</span>
          </div>
          <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (stats.bytesRead / stats.totalBytes) * 100)}%`,
                background: '#3b82f6',
                transition: 'width 0.2s'
              }}
            />
          </div>
        </div>
      )}

      {/* Import Status Panel (SQL mode) */}
      {importJob && (
        <div style={{
          padding: 16,
          background: importJob.status === 'completed' ? '#f0fdf4' :
                      importJob.status === 'failed' ? '#fef2f2' : '#eff6ff',
          border: `1px solid ${
            importJob.status === 'completed' ? '#bbf7d0' :
            importJob.status === 'failed' ? '#fecaca' : '#bfdbfe'
          }`,
          borderRadius: 8,
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 600 }}>
              {importJob.status === 'pending' && 'Ready to Import'}
              {importJob.status === 'running' && 'Uploading...'}
              {importJob.status === 'paused' && 'Paused'}
              {importJob.status === 'completed' && 'Import Complete'}
              {importJob.status === 'failed' && 'Import Failed'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Status indicator */}
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: importJob.status === 'completed' ? '#22c55e' :
                            importJob.status === 'failed' ? '#ef4444' :
                            importJob.status === 'running' ? '#f59e0b' :
                            importJob.status === 'paused' ? '#3b82f6' : '#94a3b8'
              }} />
              <span style={{ fontSize: 12, color: '#666', textTransform: 'capitalize' }}>
                {importJob.status}
              </span>
            </div>
          </div>

          {/* Chunk bar visualization */}
          {(importJob.status === 'running' || importJob.status === 'paused' || importJob.status === 'completed' || importJob.status === 'failed') && importJob.totalChunks && preparedImport && (() => {
            const companyChunks = Math.ceil(preparedImport.companies.length / chunkSize)

            const getChunkContents = (chunkNum: number) => {
              if (chunkNum === 1) {
                return { formTypes: preparedImport.formTypes.length, companies: 0, filings: 0 }
              } else if (chunkNum <= 1 + companyChunks) {
                const idx = chunkNum - 2
                const start = idx * chunkSize
                const end = Math.min(start + chunkSize, preparedImport.companies.length)
                return { formTypes: 0, companies: end - start, filings: 0 }
              } else {
                const idx = chunkNum - 2 - companyChunks
                const start = idx * chunkSize
                const end = Math.min(start + chunkSize, preparedImport.filings.length)
                return { formTypes: 0, companies: 0, filings: end - start }
              }
            }

            const displayChunk = hoveredChunk || selectedChunk
            const chunkContents = displayChunk ? getChunkContents(displayChunk) : null

            return (
              <div style={{ marginBottom: 12 }}>
                <div style={{
                  display: 'flex',
                  height: 6,
                  borderRadius: 3,
                  overflow: 'hidden',
                  background: '#e5e7eb'
                }}>
                  {Array.from({ length: importJob.totalChunks }, (_, i) => {
                    const chunkNum = i + 1
                    const isCompleted = chunkNum < (importJob.currentChunk || 0)
                    const isCurrent = chunkNum === importJob.currentChunk
                    const isPending = chunkNum > (importJob.currentChunk || 0)
                    const isSkipped = chunkNum < startChunk && startChunk > 0
                    const isHovered = chunkNum === hoveredChunk
                    const isSelected = chunkNum === selectedChunk

                    let bg = '#e5e7eb' // pending - gray
                    if (isCompleted) bg = '#22c55e' // completed - green
                    if (isCurrent && importJob.status === 'running') bg = '#f59e0b' // current running - amber
                    if (isCurrent && importJob.status === 'paused') bg = '#3b82f6' // paused - blue
                    if (isCurrent && importJob.status === 'completed') bg = '#22c55e' // completed - green
                    if (isCurrent && importJob.status === 'failed') bg = '#ef4444' // failed - red
                    if (isSkipped && isPending) bg = '#94a3b8' // skipped - darker gray
                    // Hover always shows black, selected shows black
                    if (isHovered || isSelected) bg = '#000'

                    return (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: '100%',
                          background: bg,
                          cursor: 'pointer',
                          borderRight: i < importJob.totalChunks - 1 ? '1px solid #fff' : 'none'
                        }}
                        onMouseEnter={() => setHoveredChunk(chunkNum)}
                        onMouseLeave={() => setHoveredChunk(null)}
                        onClick={() => {
                          setSelectedChunk(selectedChunk === chunkNum ? null : chunkNum)
                          if (importJob.status === 'failed' || importJob.status === 'paused') {
                            setStartChunk(chunkNum)
                          }
                        }}
                      />
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                  Chunk {importJob.currentChunk || 0} of {importJob.totalChunks}
                  {selectedChunk && <span> • <strong>Selected: {selectedChunk}</strong> (click to deselect)</span>}
                </div>
                {/* Chunk contents breakdown */}
                {chunkContents && (
                  <div style={{ marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 4, fontSize: 11 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Chunk {displayChunk} contains:</div>
                    <table style={{ width: '100%', fontSize: 11 }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: '2px 0' }}>Form Types</td>
                          <td style={{ textAlign: 'right', padding: '2px 0' }}>{chunkContents.formTypes.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 0' }}>Companies</td>
                          <td style={{ textAlign: 'right', padding: '2px 0' }}>{chunkContents.companies.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 0' }}>Filings</td>
                          <td style={{ textAlign: 'right', padding: '2px 0' }}>{chunkContents.filings.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Stats table showing type/expected/uploaded */}
          {preparedImport && (importJob.status === 'running' || importJob.status === 'paused' || importJob.status === 'completed' || importJob.status === 'failed') && (
            <div style={{ marginBottom: 12 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#666' }}>Type</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: '#666' }}>Expected</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: '#666' }}>Uploaded</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: '#666' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px 8px' }}>Form Types</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{preparedImport.formTypes.length.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{uploadedCounts.formTypes.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                      {uploadedCounts.formTypes >= preparedImport.formTypes.length ? (
                        <span style={{ color: '#22c55e' }}>✓</span>
                      ) : uploadedCounts.formTypes > 0 ? (
                        <span style={{ color: '#f59e0b' }}>…</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 8px' }}>Companies</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{preparedImport.companies.length.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{uploadedCounts.companies.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                      {uploadedCounts.companies >= preparedImport.companies.length ? (
                        <span style={{ color: '#22c55e' }}>✓</span>
                      ) : uploadedCounts.companies > 0 ? (
                        <span style={{ color: '#f59e0b' }}>…</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                  </tr>
                  <tr style={{ fontWeight: 600 }}>
                    <td style={{ padding: '4px 8px' }}>Filings</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{preparedImport.filings.length.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{uploadedCounts.filings.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                      {uploadedCounts.filings >= preparedImport.filings.length ? (
                        <span style={{ color: '#22c55e' }}>✓</span>
                      ) : uploadedCounts.filings > 0 ? (
                        <span style={{ color: '#f59e0b' }}>…</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Error message */}
          {importJob.status === 'failed' && importJob.error && (
            <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>
              {importJob.error}
            </div>
          )}

          {/* Completed stats */}
          {importJob.status === 'completed' && importJob.linesImported !== undefined && (
            <div style={{ fontSize: 13, color: '#16a34a', marginBottom: 12 }}>
              Successfully imported {importJob.linesImported.toLocaleString()} filings.
            </div>
          )}

          {/* Data info and chunk controls */}
          {preparedImport && importJob.status === 'pending' && (() => {
            const totalRows = preparedImport.filings.length + preparedImport.companies.length
            const chunkOptions = totalRows >= 100000
              ? [5000, 10000, 20000, 50000, 100000, totalRows]
              : totalRows >= 50000
              ? [5000, 10000, 20000, 50000, totalRows]
              : totalRows >= 10000
              ? [1000, 5000, 10000, totalRows]
              : [500, 1000, 5000, totalRows]
            const companyChunks = Math.ceil(preparedImport.companies.length / chunkSize)
            const filingChunks = Math.ceil(preparedImport.filings.length / chunkSize)
            const totalChunks = 1 + companyChunks + filingChunks

            // Get chunk info for a given chunk number
            const getChunkInfo = (chunkNum: number) => {
              if (chunkNum === 1) {
                return {
                  type: 'Setup',
                  description: `${preparedImport.formTypes.length} form types, ${preparedImport.extensions.length} extensions`
                }
              } else if (chunkNum <= 1 + companyChunks) {
                const companyChunkIndex = chunkNum - 2
                const start = companyChunkIndex * chunkSize
                const end = Math.min(start + chunkSize, preparedImport.companies.length)
                return {
                  type: 'Companies',
                  description: `${(end - start).toLocaleString()} companies (${(start + 1).toLocaleString()}-${end.toLocaleString()})`
                }
              } else {
                const filingChunkIndex = chunkNum - 2 - companyChunks
                const start = filingChunkIndex * chunkSize
                const end = Math.min(start + chunkSize, preparedImport.filings.length)
                return {
                  type: 'Filings',
                  description: `${(end - start).toLocaleString()} filings (${(start + 1).toLocaleString()}-${end.toLocaleString()})`
                }
              }
            }

            const displayChunk = hoveredChunk || startChunk
            const chunkInfo = displayChunk ? getChunkInfo(displayChunk) : null

            return (
              <div style={{ marginBottom: 12 }}>
                {/* Data breakdown table */}
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #ddd' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#666' }}>Type</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: '#666' }}>Records</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '4px 8px' }}>Form Types</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px' }}>{preparedImport.formTypes.length.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '4px 8px' }}>Companies</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px' }}>{preparedImport.companies.length.toLocaleString()}</td>
                    </tr>
                    <tr style={{ fontWeight: 600 }}>
                      <td style={{ padding: '4px 8px' }}>Filings</td>
                      <td style={{ textAlign: 'right', padding: '4px 8px' }}>{preparedImport.filings.length.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11 }}>
                    Upload:{' '}
                    <span
                      onClick={() => setAutoUpload(!autoUpload)}
                      style={{
                        cursor: 'pointer',
                        color: '#3b82f6',
                        textDecoration: 'underline'
                      }}
                    >
                      {autoUpload ? 'Automatic' : 'Manual'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: '#666' }}>Chunk size:</span>
                  {chunkOptions.map((size) => (
                    <button
                      key={size}
                      onClick={() => setChunkSize(size)}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        border: chunkSize === size ? '2px solid #000' : '1px solid #ddd',
                        borderRadius: 4,
                        background: chunkSize === size ? '#000' : '#fff',
                        color: chunkSize === size ? '#fff' : '#666',
                        cursor: 'pointer',
                        fontWeight: chunkSize === size ? 600 : 400
                      }}
                    >
                      {size === totalRows ? 'All' : size.toLocaleString()}
                    </button>
                  ))}
                  <span style={{ fontSize: 11, color: '#999', marginLeft: 8 }}>
                    ({totalChunks} chunks)
                  </span>
                </div>
                {/* Pending chunk bar - click to select start chunk */}
                {(() => {
                  const getChunkContents = (chunkNum: number) => {
                    if (chunkNum === 1) {
                      return { formTypes: preparedImport.formTypes.length, companies: 0, filings: 0 }
                    } else if (chunkNum <= 1 + companyChunks) {
                      const idx = chunkNum - 2
                      const start = idx * chunkSize
                      const end = Math.min(start + chunkSize, preparedImport.companies.length)
                      return { formTypes: 0, companies: end - start, filings: 0 }
                    } else {
                      const idx = chunkNum - 2 - companyChunks
                      const start = idx * chunkSize
                      const end = Math.min(start + chunkSize, preparedImport.filings.length)
                      return { formTypes: 0, companies: 0, filings: end - start }
                    }
                  }

                  const activeChunk = hoveredChunk || startChunk
                  const chunkContents = activeChunk ? getChunkContents(activeChunk) : null

                  return (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{
                        display: 'flex',
                        height: 6,
                        borderRadius: 3,
                        overflow: 'hidden',
                        background: '#e5e7eb'
                      }}>
                        {Array.from({ length: totalChunks }, (_, i) => {
                          const chunkNum = i + 1
                          const isSelected = chunkNum === startChunk
                          const willSkip = startChunk > 0 && chunkNum < startChunk
                          const isHovered = chunkNum === hoveredChunk

                          return (
                            <div
                              key={i}
                              style={{
                                flex: 1,
                                height: '100%',
                                background: isHovered || isSelected ? '#000' : willSkip ? '#94a3b8' : '#e5e7eb',
                                cursor: 'pointer',
                                borderRight: i < totalChunks - 1 ? '1px solid #fff' : 'none'
                              }}
                              onMouseEnter={() => setHoveredChunk(chunkNum)}
                              onMouseLeave={() => setHoveredChunk(null)}
                              onClick={() => setStartChunk(chunkNum === startChunk ? 0 : chunkNum)}
                            />
                          )
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                        {activeChunk ? (
                          <span>
                            <strong>Chunk {activeChunk}:</strong> {chunkInfo?.type} — {chunkInfo?.description}
                            {startChunk > 0 && !hoveredChunk && (
                              <span style={{ color: '#f59e0b', marginLeft: 8 }}>(skipping {startChunk - 1} before)</span>
                            )}
                          </span>
                        ) : (
                          <span>Hover over chunks for details, click to select start point</span>
                        )}
                      </div>
                      {/* Chunk contents breakdown */}
                      {chunkContents && (
                        <div style={{ marginTop: 8, padding: 8, background: '#f8fafc', borderRadius: 4, fontSize: 11 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>Chunk {activeChunk} contains:</div>
                          <table style={{ width: '100%', fontSize: 11 }}>
                            <tbody>
                              <tr>
                                <td style={{ padding: '2px 0' }}>Form Types</td>
                                <td style={{ textAlign: 'right', padding: '2px 0' }}>{chunkContents.formTypes.toLocaleString()}</td>
                              </tr>
                              <tr>
                                <td style={{ padding: '2px 0' }}>Companies</td>
                                <td style={{ textAlign: 'right', padding: '2px 0' }}>{chunkContents.companies.toLocaleString()}</td>
                              </tr>
                              <tr>
                                <td style={{ padding: '2px 0' }}>Filings</td>
                                <td style={{ textAlign: 'right', padding: '2px 0' }}>{chunkContents.filings.toLocaleString()}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {importJob.status === 'pending' && generatedSQL && (
              <button
                className="btn"
                onClick={() => {
                  const blob = new Blob([generatedSQL], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'sec_filings_import.sql'
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                style={{ fontSize: 13 }}
              >
                Download SQL
              </button>
            )}
            {importJob.status === 'pending' && (
              <button
                className="btn btn-primary"
                onClick={() => runChunkedUpload(startChunk)}
                disabled={!preparedImport}
                style={{ fontSize: 13 }}
              >
                {startChunk > 0 ? `Resume from Chunk ${startChunk}` : 'Begin Upload'}
              </button>
            )}
            {importJob.status === 'running' && (
              <button
                className="btn"
                onClick={stopUpload}
                style={{ fontSize: 13, background: '#ef4444', color: 'white', border: 'none' }}
              >
                Stop Upload
              </button>
            )}
            {importJob.status === 'paused' && (
              <button
                className="btn btn-primary"
                onClick={() => runChunkedUpload(startChunk)}
                style={{ fontSize: 13 }}
              >
                Next Chunk ({startChunk} of {importJob.totalChunks})
              </button>
            )}
            {(importJob.status === 'pending' || importJob.status === 'failed' || importJob.status === 'completed' || importJob.status === 'paused') && (
              <button
                className="btn"
                onClick={cancelImport}
                style={{ fontSize: 13 }}
              >
                {importJob.status === 'completed' ? 'Clear' : 'Cancel'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div style={{
          padding: 16,
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          color: '#dc2626'
        }}>
          Error: {error}
        </div>
      )}

    </div>
  )
}

export default SECDailyIndices
