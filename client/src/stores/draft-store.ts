import { saveQueueRecordSchema, type SaveQueueRecord } from 'shared/schemas/save-queue'

export interface DraftStore {
  list(): Promise<SaveQueueRecord[]>
  put(record: SaveQueueRecord): Promise<void>
}
interface DesktopDraftBridge {
  readSaveQueue?: () => Promise<unknown[]>
  writeSaveQueue?: (record: SaveQueueRecord) => Promise<void>
}
export function createDraftStore(): DraftStore {
  const desktop = (window as unknown as { xeno?: DesktopDraftBridge }).xeno
  if (desktop?.readSaveQueue && desktop.writeSaveQueue) return {
    list: async () => (await desktop.readSaveQueue!()).map(record => saveQueueRecordSchema.parse(record)),
    put: record => desktop.writeSaveQueue!(saveQueueRecordSchema.parse(record)),
  }
  let connection: Promise<IDBDatabase> | undefined
  const open = () => connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('xenolinguist-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('profiles', { keyPath: 'profileId' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Draft storage unavailable'))
    request.onblocked = () => reject(new Error('Draft storage is blocked by another window'))
  })
  return {
    async list() {
      const database = await open()
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('profiles', 'readonly')
        const request = transaction.objectStore('profiles').getAll()
        transaction.oncomplete = () => {
          try { resolve(request.result.map(record => saveQueueRecordSchema.parse(record))) }
          catch (error) { reject(error) }
        }
        transaction.onabort = () => reject(transaction.error ?? new Error('Draft read failed'))
        transaction.onerror = () => reject(transaction.error ?? new Error('Draft read failed'))
      })
    },
    async put(record) {
      const checked = saveQueueRecordSchema.parse(record)
      const database = await open()
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('profiles', 'readwrite', { durability: 'strict' })
        transaction.objectStore('profiles').put(checked)
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error ?? new Error('Draft write failed'))
        transaction.onerror = () => reject(transaction.error ?? new Error('Draft write failed'))
      })
    },
  }
}
