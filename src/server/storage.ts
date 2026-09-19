import { encryptBytes, decryptBytes, importMasterKey } from './crypto.js'
import type { DriveAdapter } from './drive-adapter.js'
import type { MasterKey } from './crypto.js'
import type { SchemaConfig } from '../shared/types.js'

export interface StoredFile {
  name: string
  id: string
  mimeType: string
  size: number
}

export class StorageEngine {
  constructor(
    private schema: SchemaConfig,
    private drive: DriveAdapter,
    private storageFolderId: string,
    private masterKey: MasterKey,
  ) {}

  async ensureBucket(bucket: string): Promise<string> {
    const folder = await this.drive.findByName(this.storageFolderId, bucket)
    if (folder) return folder.id
    const created = await this.drive.createFolder(this.storageFolderId, bucket)
    return created.id
  }

  async upload(bucket: string, path: string, data: Uint8Array, mimeType = 'application/octet-stream'): Promise<StoredFile> {
    const bucketId = await this.ensureBucket(bucket)
    const encrypted = await encryptBytes(data, this.masterKey)
    const file = await this.drive.writeBlob(bucketId, path, encrypted, mimeType)
    return { name: path, id: file.id, mimeType, size: data.length }
  }

  async download(bucket: string, path: string): Promise<Uint8Array> {
    const bucketId = await this.ensureBucket(bucket)
    const file = await this.drive.findByName(bucketId, path)
    if (!file) throw new Error(`GDDB Storage: file "${path}" not found in bucket "${bucket}"`)
    const blob = await this.drive.download(file.id)
    return decryptBytes(blob, this.masterKey)
  }

  async list(bucket: string, prefix?: string, limit = 100, offset = 0): Promise<StoredFile[]> {
    const bucketId = await this.ensureBucket(bucket)
    const files = await this.drive.list(bucketId)
    let result = files.map((f) => ({ name: f.name, id: f.id, mimeType: f.mimeType, size: 0 }))
    if (prefix) result = result.filter((f) => f.name.startsWith(prefix))
    return result.slice(offset, offset + limit)
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    const bucketId = await this.ensureBucket(bucket)
    for (const path of paths) {
      const file = await this.drive.findByName(bucketId, path)
      if (file) await this.drive.delete(file.id)
    }
  }
}
