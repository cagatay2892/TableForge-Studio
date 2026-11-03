import type { Dataset, DatasetSummary } from './types'

const DATABASE_NAME = 'tableforge-local'
const DATABASE_VERSION = 1
const DATASETS = 'datasets'

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DATASETS)) database.createObjectStore(DATASETS, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'))
  })
}

export function getSummary(dataset: Dataset): DatasetSummary {
  return {
    id: dataset.id,
    name: dataset.name,
    importedAt: dataset.importedAt,
    rowCount: dataset.rows.length,
    columnCount: dataset.headers.length,
    sourceSize: dataset.sourceSize,
  }
}

export async function saveDataset(dataset: Dataset) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DATASETS, 'readwrite')
    transaction.objectStore(DATASETS).put(dataset)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this dataset.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('The save was cancelled.'))
  })
  database.close()
}

export async function loadDataset(id: string) {
  const database = await openDatabase()
  const result = await new Promise<Dataset>((resolve, reject) => {
    const request = database.transaction(DATASETS, 'readonly').objectStore(DATASETS).get(id)
    request.onsuccess = () => resolve(request.result as Dataset)
    request.onerror = () => reject(request.error ?? new Error('Could not open this saved dataset.'))
  })
  database.close()
  return result
}

export async function listDatasets() {
  const database = await openDatabase()
  const result = await new Promise<DatasetSummary[]>((resolve, reject) => {
    const request = database.transaction(DATASETS, 'readonly').objectStore(DATASETS).getAll()
    request.onsuccess = () => resolve((request.result as Dataset[]).map(getSummary).sort((a, b) => b.importedAt.localeCompare(a.importedAt)))
    request.onerror = () => reject(request.error ?? new Error('Could not list saved datasets.'))
  })
  database.close()
  return result
}

export async function removeDataset(id: string) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DATASETS, 'readwrite')
    transaction.objectStore(DATASETS).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete this dataset.'))
  })
  database.close()
}

