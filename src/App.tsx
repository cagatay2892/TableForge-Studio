import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpDown,
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Columns3,
  Database,
  FileSpreadsheet,
  Filter,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { sampleCsv } from './lib/sample'
import { listDatasets, loadDataset, removeDataset, saveDataset } from './lib/storage'
import type { ColumnProfile, Dataset, DatasetSummary } from './lib/types'
import './App.css'

type View = 'explore' | 'profile'
type SortState = { column: number; direction: 'asc' | 'desc' }

const PAGE_SIZE = 18
const FILE_LIMIT = 25 * 1024 * 1024

function formatNumber(value: number) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function cellNumber(value: string) {
  const normalized = value.trim().replace(/,/g, '')
  return normalized === '' ? Number.NaN : Number(normalized)
}

function cellText(value: string) {
  return value?.trim() || '—'
}

function exportCsv(dataset: Dataset, rows: string[][]) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`
  const content = [dataset.headers, ...rows].map((row) => row.map((value) => escape(value ?? '')).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${dataset.name.replace(/\.[^.]+$/, '')}-filtered.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function columnTypeLabel(column: ColumnProfile) {
  return column.type === 'number' ? 'Number' : column.type === 'date' ? 'Date' : column.type === 'boolean' ? 'Boolean' : 'Text'
}

function BarVisualization({ data, dimension, valueLabel }: { data: Array<{ label: string; value: number; count: number }>; dimension: string; valueLabel: string }) {
  const maximum = Math.max(...data.map((item) => item.value), 1)
  return <div className="bar-chart" role="img" aria-label={`${valueLabel} grouped by ${dimension}`}>
    {data.length ? data.map((item, index) => <div className="bar-row" key={`${item.label}-${index}`}>
      <div className="bar-label" title={item.label}>{item.label || '(blank)'}</div>
      <div className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(2, item.value / maximum * 100)}%`, opacity: 1 - index * 0.045 }} /></div>
      <div className="bar-value" title={`${formatNumber(item.value)} · ${item.count} rows`}>{formatNumber(item.value)}</div>
    </div>) : <div className="empty-chart">No matching rows for this chart.</div>}
  </div>
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [savedDatasets, setSavedDatasets] = useState<DatasetSummary[]>([])
  const [isDemo, setIsDemo] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [view, setView] = useState<View>('explore')
  const [search, setSearch] = useState('')
  const [filterColumn, setFilterColumn] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sort, setSort] = useState<SortState>({ column: 0, direction: 'asc' })
  const [page, setPage] = useState(0)
  const [dimension, setDimension] = useState('')
  const [metric, setMetric] = useState('__count__')
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lightMode, setLightMode] = useState(() => {
    try { return localStorage.getItem('tableforge.theme') === 'light' } catch { return false }
  })
  const deferredSearch = useDeferredValue(search)

  useEffect(() => {
    let cancelled = false
    async function restoreWorkspace() {
      try {
        const summaries = await listDatasets()
        if (cancelled) return
        setSavedDatasets(summaries)
        if (summaries.length) {
          const latest = await loadDataset(summaries[0].id)
          if (!cancelled) {
            setDataset(latest)
            setIsDemo(false)
            setIsSaved(true)
          }
        } else {
          parseFile(new File([sampleCsv], 'quarterly-orders.csv', { type: 'text/csv' }), false, 'Loading sample data')
        }
      } catch {
        if (!cancelled) {
          setError('Browser storage is unavailable. You can still explore files for this session.')
          parseFile(new File([sampleCsv], 'quarterly-orders.csv', { type: 'text/csv' }), false, 'Loading sample data')
        }
      }
    }
    void restoreWorkspace()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = lightMode ? 'light' : 'dark'
    try { localStorage.setItem('tableforge.theme', lightMode ? 'light' : 'dark') } catch { /* Theme still works for this session. */ }
  }, [lightMode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInput.current?.focus()
      }
      if (event.key === 'Escape') {
        setSearch('')
        setFilterValue('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const filteredRows = useMemo(() => {
    if (!dataset) return []
    const query = deferredSearch.trim().toLowerCase()
    const filterIndex = dataset.headers.indexOf(filterColumn)
    return dataset.rows.filter((row) => {
      const matchesSearch = !query || row.some((cell) => cell.toLowerCase().includes(query))
      const matchesColumn = !filterValue || filterIndex < 0 || row[filterIndex] === filterValue
      return matchesSearch && matchesColumn
    })
  }, [dataset, deferredSearch, filterColumn, filterValue])

  const sortedRows = useMemo(() => {
    if (!dataset || !sort) return filteredRows
    const type = dataset.columns[sort.column]?.type
    return [...filteredRows].sort((left, right) => {
      const a = left[sort.column] ?? ''
      const b = right[sort.column] ?? ''
      let compare = 0
      if (type === 'number') compare = cellNumber(a) - cellNumber(b)
      else if (type === 'date') compare = new Date(a).getTime() - new Date(b).getTime()
      else compare = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      if (Number.isNaN(compare)) compare = a.localeCompare(b)
      return sort.direction === 'asc' ? compare : -compare
    })
  }, [dataset, filteredRows, sort])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const visibleRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalCells = (dataset?.rows.length ?? 0) * (dataset?.headers.length ?? 0)
  const missingCells = dataset?.columns.reduce((sum, column) => sum + column.missingCount, 0) ?? 0
  const completeness = totalCells ? Math.round((1 - missingCells / totalCells) * 100) : 100

  const chartData = useMemo(() => {
    if (!dataset) return []
    const dimensionIndex = dataset.headers.indexOf(dimension || dataset.headers[0])
    const metricParts = metric.split('|')
    const metricIndex = metricParts[1] ? dataset.headers.indexOf(metricParts[1]) : -1
    const operation = metricParts[0]
    const groups = new Map<string, { label: string; value: number; count: number; validCount: number }>()
    for (const row of filteredRows) {
      const label = row[dimensionIndex] || '(blank)'
      const current = groups.get(label) ?? { label, value: 0, count: 0, validCount: 0 }
      current.count += 1
      if (metricIndex >= 0) {
        const value = cellNumber(row[metricIndex] ?? '')
        if (Number.isFinite(value)) { current.value += value; current.validCount += 1 }
      } else { current.value += 1; current.validCount += 1 }
      groups.set(label, current)
    }
    const data = Array.from(groups.values())
    if (operation === 'avg') data.forEach((item) => { item.value = item.validCount ? item.value / item.validCount : 0 })
    return data.sort((a, b) => b.value - a.value).slice(0, 8)
  }, [dataset, dimension, filteredRows, metric])

  const distinctValues = useMemo(() => {
    if (!dataset || !filterColumn) return []
    const index = dataset.headers.indexOf(filterColumn)
    return Array.from(new Set(dataset.rows.map((row) => row[index] ?? '').filter(Boolean))).sort((a, b) => a.localeCompare(b)).slice(0, 200)
  }, [dataset, filterColumn])

  const numericColumns = dataset?.columns.filter((column) => column.type === 'number') ?? []
  const chartDimension = dimension || dataset?.headers[0] || ''
  const metricParts = metric.split('|')
  const valueLabel = metric === '__count__' ? 'Row count' : `${metricParts[0] === 'avg' ? 'Average' : 'Sum'} of ${metricParts[1]}`

  async function refreshSavedList() {
    try { setSavedDatasets(await listDatasets()) } catch { setError('Could not refresh the local dataset library.') }
  }

  function parseFile(file: File, persist: boolean, statusLabel = `Reading ${file.name}`) {
    setLoading(true)
    setLoadingLabel(statusLabel)
    const workerUrl = `${import.meta.env.BASE_URL}csv.worker.js`
    const worker = new Worker(workerUrl, { type: 'module' })
    worker.onmessage = async (event: MessageEvent<{ type: 'status'; message: string } | { type: 'success'; dataset: Dataset } | { type: 'error'; message: string }>) => {
      if (event.data.type === 'status') {
        setLoadingLabel(event.data.message)
        return
      }
      worker.terminate()
      if (event.data.type === 'error') {
        setError(event.data.message)
        setLoading(false)
        setLoadingLabel('')
        return
      }
      const nextDataset = event.data.dataset
      let savedSuccessfully = false
      if (persist) {
        try {
          await saveDataset(nextDataset)
          await refreshSavedList()
          savedSuccessfully = true
          setNotice(`${nextDataset.name} saved in this browser.`)
        } catch {
          setError('The file parsed, but the browser could not save it. Check available storage and try again.')
        }
      }
      setDataset(nextDataset)
      setIsDemo(!persist)
      setIsSaved(savedSuccessfully)
      setView('explore')
      setSearch('')
      setFilterColumn('')
      setFilterValue('')
      setPage(0)
      setDimension(nextDataset.columns.find((column) => column.type !== 'number')?.name ?? nextDataset.headers[0])
      setMetric('__count__')
      setLoading(false)
      setLoadingLabel('')
    }
    worker.onerror = () => {
      worker.terminate()
      setError('The CSV worker stopped unexpectedly. Try a smaller or simpler file.')
      setLoading(false)
      setLoadingLabel('')
    }
    worker.postMessage(file)
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setError('')
    setNotice('')
    if (!/\.(csv|tsv)$/i.test(file.name)) {
      setError('Choose a .csv or .tsv file.')
      return
    }
    if (file.size > FILE_LIMIT) {
      setError(`This file is larger than the ${formatSize(FILE_LIMIT)} limit.`)
      return
    }
    parseFile(file, true)
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files)
    event.target.value = ''
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  async function loadSavedDataset(summary: DatasetSummary) {
    setError('')
    try {
      const nextDataset = await loadDataset(summary.id)
      setDataset(nextDataset)
      setIsDemo(false)
      setIsSaved(true)
      setView('explore')
      setSearch('')
      setFilterColumn('')
      setFilterValue('')
      setPage(0)
      setDimension(nextDataset.columns.find((column) => column.type !== 'number')?.name ?? nextDataset.headers[0])
      setMetric('__count__')
    } catch {
      setError('Could not open this saved dataset. It may have been removed from browser storage.')
    }
  }

  async function deleteSavedDataset(summary: DatasetSummary) {
    try {
      await removeDataset(summary.id)
      const nextSummaries = await listDatasets()
      setSavedDatasets(nextSummaries)
      if (dataset?.id === summary.id) {
        if (nextSummaries.length) await loadSavedDataset(nextSummaries[0])
        else {
          parseFile(new File([sampleCsv], 'quarterly-orders.csv', { type: 'text/csv' }), false, 'Loading sample data')
        }
      }
      setNotice(`${summary.name} removed from this browser.`)
    } catch {
      setError('Could not remove this dataset from browser storage.')
    }
  }

  async function saveToLibrary() {
    if (!dataset || isSaved) return
    const copy = isDemo ? { ...dataset, id: crypto.randomUUID(), importedAt: new Date().toISOString() } : dataset
    try {
      await saveDataset(copy)
      setDataset(copy)
      setIsDemo(false)
      setIsSaved(true)
      await refreshSavedList()
      setNotice('Dataset saved to your local library.')
    } catch {
      setError('Browser storage is unavailable, so this dataset cannot be saved.')
    }
  }

  function changeSort(column: number) {
    setSort((current) => ({ column, direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc' }))
    setPage(0)
  }

  function clearFilters() {
    setSearch('')
    setFilterColumn('')
    setFilterValue('')
    setPage(0)
  }

  return <div className={`app-shell ${lightMode ? 'light-mode' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }} onDrop={onDrop}>
    <input ref={fileInput} className="visually-hidden" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={onFileChange} />
    {dragging && <div className="drop-overlay"><div><Upload size={28} /><strong>Drop to analyze</strong><span>Your file stays in this browser.</span></div></div>}
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={(event) => event.preventDefault()}><span className="brand-mark"><Table2 size={18} /></span><span>table<span>forge</span></span><span className="brand-tag">STUDIO</span></a>
      <div className="workspace-pill"><span className="workspace-avatar">T</span><span><small>WORKSPACE</small><strong>Personal library</strong></span><MoreHorizontal size={16} /></div>
      <div className="side-heading">Workspace</div>
      <nav className="side-nav" aria-label="Workspace navigation">
        <button className={view === 'explore' ? 'active' : ''} onClick={() => setView('explore')}><LayoutDashboard size={16} />Explore data</button>
        <button className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')} disabled={!dataset}><Columns3 size={16} />Data profile</button>
      </nav>
      <div className="library-heading"><span>Your datasets</span><button type="button" aria-label="Import a dataset" onClick={() => fileInput.current?.click()}>+</button></div>
      <div className="dataset-list">
        {savedDatasets.map((item) => <div className={`dataset-item ${dataset?.id === item.id ? 'selected' : ''}`} key={item.id}>
          <button type="button" className="dataset-open" onClick={() => { void loadSavedDataset(item) }}><span className="dataset-file-icon"><FileSpreadsheet size={15} /></span><span className="dataset-meta"><strong title={item.name}>{item.name}</strong><small>{formatNumber(item.rowCount)} rows · {formatSize(item.sourceSize)}</small></span></button>
          <button type="button" className="dataset-delete" aria-label={`Remove ${item.name}`} title="Remove from browser" onClick={() => { void deleteSavedDataset(item) }}><Trash2 size={13} /></button>
        </div>)}
        {!savedDatasets.length && <p className="sidebar-empty">Import a CSV to start your library.</p>}
      </div>
      <div className="sidebar-spacer" />
      <div className="privacy-card"><span className="privacy-icon"><LockKeyhole size={15} /></span><strong>Your data stays yours</strong><p>Files are parsed and saved locally in this browser.</p><span className="privacy-status"><i />LOCAL STORAGE</span></div>
      <div className="sidebar-bottom"><a href="https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API" target="_blank" rel="noreferrer"><CircleHelp size={15} />Storage guide</a><div className="profile"><span className="profile-avatar">TF</span><span><strong>Local workspace</strong><small>No account required</small></span></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><strong>{view === 'explore' ? 'Explore' : 'Data profile'}</strong></div>
        <div className="topbar-actions"><span className="privacy-badge"><ShieldCheck size={14} />PRIVATE BY DESIGN</span><button className="theme-toggle" type="button" onClick={() => setLightMode((current) => !current)} title={`Switch to ${lightMode ? 'dark' : 'light'} theme`}><span className="theme-knob" /></button><a className="avatar-mini" href="https://github.com" target="_blank" rel="noreferrer" aria-label="GitHub">TF</a></div>
      </header>

      <div className="page-content">
        <div className="page-title-row">
          <div><div className="eyebrow"><span className="crumb-chip">DATA WORKSPACE</span><ChevronRight size={12} />{view === 'explore' ? 'OVERVIEW' : 'FIELD QUALITY'}</div><h1>{view === 'explore' ? 'Your data, in focus.' : 'Understand every column.'}</h1><p>{view === 'explore' ? 'Turn a flat file into clear signals and useful answers.' : 'Review data types, completeness, uniqueness, and sample values.'}</p></div>
          <div className="title-actions"><button type="button" className="outline-button" onClick={() => setLightMode((current) => !current)}><Sparkles size={14} />Theme</button><button type="button" className="primary-button" onClick={() => fileInput.current?.click()}><Upload size={15} />Import CSV</button></div>
        </div>

        {error && <div className="message error-message" role="alert"><X size={16} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
        {notice && <div className="message success-message" role="status"><Check size={15} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={14} /></button></div>}

        {loading ? <section className="loading-panel panel"><LoaderCircle size={27} className="spin" /><strong>{loadingLabel || 'Preparing your data'}</strong><span>Parsing and profiling in a background worker…</span></section> : dataset ? <>
          <section className="dataset-banner panel">
            <div className="dataset-banner-left"><span className="dataset-large-icon"><FileSpreadsheet size={19} /></span><div><div className="dataset-title-line"><h2>{dataset.name}</h2><span className={isDemo ? 'demo-tag' : isSaved ? 'saved-tag' : 'unsaved-tag'}>{isDemo ? 'SAMPLE DATA' : isSaved ? <><Check size={11} /> SAVED LOCALLY</> : 'SESSION ONLY'}</span></div><p>{formatSize(dataset.sourceSize)} <span>·</span> Imported {formatDate(dataset.importedAt)} <span>·</span> {dataset.delimiter === '\t' ? 'Tab-delimited' : dataset.delimiter === ';' ? 'Semicolon-delimited' : 'Comma-delimited'}</p></div></div>
            <div className="dataset-banner-actions"><button type="button" className="outline-button small" onClick={() => fileInput.current?.click()}><FolderOpen size={14} />Change file</button>{isSaved ? <button type="button" className="outline-button small" onClick={() => exportCsv(dataset, sortedRows)}><ArrowDownToLine size={14} />Export CSV</button> : <button type="button" className="primary-button small" onClick={() => { void saveToLibrary() }}><HardDrive size={14} />Save to library</button>}</div>
          </section>

          {dataset.truncated && <div className="message warning-message"><CircleHelp size={15} /><span>Showing the first 100,000 rows to keep the workspace responsive.</span></div>}

          <div className="metric-grid">
            <article className="metric-card"><span className="metric-icon mint"><Table2 size={17} /></span><div><span className="metric-label">Rows</span><strong>{formatNumber(dataset.rows.length)}</strong><small>{filteredRows.length !== dataset.rows.length ? `${formatNumber(filteredRows.length)} match filters` : 'Records analyzed'}</small></div></article>
            <article className="metric-card"><span className="metric-icon blue"><Columns3 size={17} /></span><div><span className="metric-label">Columns</span><strong>{dataset.headers.length}</strong><small>{dataset.columns.filter((column) => column.type === 'number').length} numeric fields</small></div></article>
            <article className="metric-card"><span className="metric-icon amber"><Filter size={16} /></span><div><span className="metric-label">Completeness</span><strong>{completeness}%</strong><small>{formatNumber(missingCells)} empty cells</small></div><div className="metric-progress"><span style={{ width: `${completeness}%` }} /></div></article>
            <article className="metric-card"><span className="metric-icon violet"><Database size={17} /></span><div><span className="metric-label">Duplicate rows</span><strong>{formatNumber(dataset.duplicateRows)}</strong><small>{dataset.rows.length ? `${Math.round(dataset.duplicateRows / dataset.rows.length * 100)}% of records` : 'No records'}</small></div></article>
          </div>

          {view === 'explore' ? <>
            <section className="panel visualization-panel">
              <div className="panel-heading"><div><div className="eyebrow">Quick analysis</div><h2>What stands out?</h2><p>{valueLabel} grouped by {chartDimension || 'field'}</p></div><div className="chart-controls"><label>Group by<select value={chartDimension} onChange={(event) => setDimension(event.target.value)}>{dataset.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select><ChevronDown size={13} /></label><label>Measure<select value={metric} onChange={(event) => setMetric(event.target.value)}><option value="__count__">Row count</option>{numericColumns.map((column) => <optgroup label={column.name} key={column.name}><option value={`sum|${column.name}`}>Sum of {column.name}</option><option value={`avg|${column.name}`}>Average {column.name}</option></optgroup>)}</select><ChevronDown size={13} /></label></div></div>
              <BarVisualization data={chartData} dimension={chartDimension} valueLabel={valueLabel} />
              <div className="chart-foot"><span><i />Top 8 groups</span><span>{formatNumber(filteredRows.length)} rows in current view</span></div>
            </section>

            <section className="panel table-panel">
              <div className="panel-heading table-heading"><div><div className="eyebrow">Data explorer</div><h2>Rows preview <span>{formatNumber(sortedRows.length)}</span></h2></div><div className="table-tools"><div className="table-search"><Search size={15} /><input ref={searchInput} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search every field…" aria-label="Search every field" /><kbd>⌘ K</kbd></div><label className="filter-select"><Filter size={14} /><select aria-label="Filter by column" value={filterColumn} onChange={(event) => { setFilterColumn(event.target.value); setFilterValue(''); setPage(0) }}><option value="">All columns</option>{dataset.headers.map((header) => <option key={header}>{header}</option>)}</select></label>{filterColumn && <label className="filter-select value-filter"><select aria-label={`Filter ${filterColumn}`} value={filterValue} onChange={(event) => { setFilterValue(event.target.value); setPage(0) }}><option value="">All values</option>{distinctValues.map((value) => <option key={value}>{value}</option>)}</select></label>}</div></div>
              {(search || filterValue) && <div className="filter-summary"><span><Filter size={13} />Showing {formatNumber(sortedRows.length)} of {formatNumber(dataset.rows.length)} rows</span><button type="button" onClick={clearFilters}>Clear filters <X size={12} /></button></div>}
              <div className="table-scroll"><table><thead><tr>{dataset.headers.map((header, index) => <th key={`${header}-${index}`}><button type="button" onClick={() => changeSort(index)} title={`Sort by ${header}`}><span>{header}</span>{sort.column === index ? <ArrowUpDown size={12} className={sort.direction === 'desc' ? 'sort-desc' : ''} /> : <ArrowUpDown size={11} className="sort-muted" />}</button><small>{columnTypeLabel(dataset.columns[index])}</small></th>)}</tr></thead><tbody>{visibleRows.map((row, rowIndex) => <tr key={`${page}-${rowIndex}`}>{dataset.headers.map((header, columnIndex) => <td key={`${header}-${columnIndex}`} title={row[columnIndex]}>{cellText(row[columnIndex])}</td>)}</tr>)}{!visibleRows.length && <tr><td colSpan={dataset.headers.length} className="empty-table">No rows match the current filters.</td></tr>}</tbody></table></div>
              <div className="table-footer"><span>Showing <strong>{sortedRows.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, sortedRows.length)}</strong> of <strong>{formatNumber(sortedRows.length)}</strong> rows</span><div className="pagination"><button type="button" disabled={page <= 0} aria-label="Previous page" onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15} /></button><span>{page + 1} <small>/</small> {pageCount}</span><button type="button" disabled={page + 1 >= pageCount} aria-label="Next page" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}><ChevronRight size={15} /></button></div></div>
            </section>
          </> : <section className="panel profile-panel">
            <div className="panel-heading"><div><div className="eyebrow">Data quality</div><h2>Field profile</h2><p>Completeness and shape for every column in this dataset.</p></div><span className="profile-summary"><ShieldCheck size={14} />{completeness}% complete</span></div>
            <div className="profile-table-wrap"><table className="profile-table"><thead><tr><th>Field</th><th>Type</th><th>Filled</th><th>Missing</th><th>Unique</th><th>Sample values</th></tr></thead><tbody>{dataset.columns.map((column, index) => {
              const filled = dataset.rows.length - column.missingCount
              const percent = dataset.rows.length ? Math.round(filled / dataset.rows.length * 100) : 0
              return <tr key={column.name}><td><span className="field-cell"><span className="field-index">{String(index + 1).padStart(2, '0')}</span><strong>{column.name}</strong></span></td><td><span className={`type-pill type-${column.type}`}>{column.type === 'number' ? '123' : column.type === 'date' ? 'CAL' : column.type === 'boolean' ? 'T/F' : 'ABC'}<span>{columnTypeLabel(column)}</span></span></td><td>{formatNumber(filled)} <span className="subtle">({percent}%)</span></td><td>{column.missingCount ? <span className="missing-value">{formatNumber(column.missingCount)}</span> : <span className="good-value"><Check size={12} />0</span>}</td><td>{formatNumber(column.uniqueCount)}</td><td><div className="example-chips">{column.examples.length ? column.examples.map((value) => <span key={value} title={value}>{value}</span>) : <i>No values</i>}</div></td></tr>
            })}</tbody></table></div>
            <div className="profile-footer"><span><ShieldCheck size={14} />Profiling runs locally in a web worker.</span><button type="button" onClick={() => exportCsv(dataset, sortedRows)}><ArrowDownToLine size={14} />Export filtered rows</button></div>
          </section>}

          <footer className="page-footer"><span>TableForge Studio <i />Local-first data workspace</span><span>Nothing is uploaded. <a href="https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API" target="_blank" rel="noreferrer">Learn about local storage <ChevronRight size={12} /></a></span></footer>
        </> : <section className="welcome-panel panel"><div className="welcome-icon"><BarChart3 size={23} /></div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Bring a CSV to life.</h2><p>Import a file to profile columns, spot patterns, filter rows, and export a clean view. Everything stays in your browser.</p><div className="welcome-actions"><button type="button" className="primary-button" onClick={() => fileInput.current?.click()}><Upload size={15} />Choose a CSV file</button><button type="button" className="outline-button" onClick={() => parseFile(new File([sampleCsv], 'quarterly-orders.csv', { type: 'text/csv' }), false, 'Loading sample data')}><Sparkles size={14} />Try the sample</button></div><div className="welcome-trust"><span><LockKeyhole size={14} />Local-only processing</span><span><Database size={14} />IndexedDB library</span><span><BarChart3 size={14} />Interactive analysis</span></div></section>}
      </div>
    </main>
  </div>
}

export default App

