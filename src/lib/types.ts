export type ColumnType = 'number' | 'date' | 'boolean' | 'text'

export type ColumnProfile = {
  name: string
  type: ColumnType
  missingCount: number
  uniqueCount: number
  examples: string[]
}

export type Dataset = {
  id: string
  name: string
  importedAt: string
  sourceSize: number
  delimiter: string
  headers: string[]
  rows: string[][]
  columns: ColumnProfile[]
  duplicateRows: number
  truncated: boolean
}

export type DatasetSummary = {
  id: string
  name: string
  importedAt: string
  rowCount: number
  columnCount: number
  sourceSize: number
}

