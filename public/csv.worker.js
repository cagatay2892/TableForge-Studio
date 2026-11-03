const MAX_ROWS = 100000
const DELIMITERS = [',', '\t', ';', '|']

function detectDelimiter(text) {
  const sample = text.slice(0, 8000)
  let best = ','
  let bestScore = -1
  for (const delimiter of DELIMITERS) {
    let quoted = false
    let fields = 0
    let lines = 0
    for (let index = 0; index < sample.length && lines < 8; index += 1) {
      const char = sample[index]
      if (char === '"') {
        if (quoted && sample[index + 1] === '"') index += 1
        else quoted = !quoted
      } else if (!quoted && char === delimiter) fields += 1
      else if (!quoted && (char === '\n' || char === '\r')) lines += 1
    }
    const score = fields / Math.max(lines, 1)
    if (score > bestScore) { best = delimiter; bestScore = score }
  }
  return best
}

function parseRows(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1 }
      else if (char === '"') quoted = false
      else field += char
      continue
    }
    if (char === '"' && field.length === 0) quoted = true
    else if (char === delimiter) { row.push(field); field = '' }
    else if (char === '\n' || char === '\r') {
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
      if (char === '\r' && text[index + 1] === '\n') index += 1
    } else field += char
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}

function uniqueHeaders(input, width) {
  const seen = new Map()
  return Array.from({ length: width }, (_, index) => {
    const raw = input[index]?.replace(/^\uFEFF/, '').trim() || `Column ${index + 1}`
    const count = (seen.get(raw) || 0) + 1
    seen.set(raw, count)
    return count === 1 ? raw : `${raw} (${count})`
  })
}

function inferColumn(name, values) {
  const present = values.map((value) => value.trim()).filter(Boolean)
  const unique = Array.from(new Set(present))
  const booleanCount = present.filter((value) => /^(true|false|yes|no)$/i.test(value)).length
  const numberCount = present.filter((value) => {
    const normalized = value.replace(/,/g, '')
    return normalized !== '' && Number.isFinite(Number(normalized))
  }).length
  const dateCount = present.filter((value) => /[./-]/.test(value) && !Number.isNaN(Date.parse(value))).length
  let type = 'text'
  if (present.length > 0 && booleanCount / present.length >= 0.9) type = 'boolean'
  else if (present.length > 0 && numberCount / present.length >= 0.9) type = 'number'
  else if (present.length > 0 && dateCount / present.length >= 0.9) type = 'date'
  return { name, type, missingCount: values.length - present.length, uniqueCount: unique.length, examples: unique.slice(0, 3) }
}

function analyzeCsv(text, name, sourceSize) {
  const normalized = text.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(normalized)
  const allRows = parseRows(normalized, delimiter)
  if (allRows.length < 2) throw new Error('This file needs a header row and at least one data row.')
  const width = Math.max(...allRows.map((row) => row.length))
  const headers = uniqueHeaders(allRows[0], width)
  const dataRows = allRows.slice(1)
  const truncated = dataRows.length > MAX_ROWS
  const rows = dataRows.slice(0, MAX_ROWS).map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''))
  const columns = headers.map((header, index) => inferColumn(header, rows.map((row) => row[index])))
  const seenRows = new Set()
  let duplicateRows = 0
  for (const row of rows) {
    const key = JSON.stringify(row)
    if (seenRows.has(key)) duplicateRows += 1
    else seenRows.add(key)
  }
  return { id: crypto.randomUUID(), name, importedAt: new Date().toISOString(), sourceSize, delimiter, headers, rows, columns, duplicateRows, truncated }
}

self.onmessage = async (event) => {
  try {
    const file = event.data
    self.postMessage({ type: 'status', message: `Analyzing ${file.name}` })
    const dataset = analyzeCsv(await file.text(), file.name, file.size)
    self.postMessage({ type: 'success', dataset })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unable to read this file.' })
  }
}

