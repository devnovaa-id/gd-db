import type { DriveAdapter, DriveFile } from './drive-adapter.js'

interface MockNode {
  id: string
  name: string
  mimeType: string
  data: Uint8Array
  parentId: string | null
}

let counter = 0
function genId(): string {
  return `mock-${++counter}`
}

export class MockDriveAdapter implements DriveAdapter {
  private files = new Map<string, MockNode>()

  constructor() {
    this.createFolder('root', 'root')
  }

  async readBlob(id: string): Promise<Uint8Array> {
    const node = this.files.get(id)
    if (!node) throw new Error(`GDDB Mock: file ${id} not found`)
    return node.data
  }

  async writeBlob(parentId: string, name: string, data: Uint8Array, mimeType = 'application/octet-stream'): Promise<DriveFile> {
    const existing = await this.findByName(parentId, name)
    if (existing) {
      const node = this.files.get(existing.id)!
      node.data = data
      return node
    }
    const node: MockNode = { id: genId(), name, mimeType, data, parentId }
    this.files.set(node.id, node)
    return node
  }

  async upload(parentId: string, name: string, data: Uint8Array, mimeType = 'application/octet-stream'): Promise<DriveFile> {
    return this.writeBlob(parentId, name, data, mimeType)
  }

  async download(id: string): Promise<Uint8Array> {
    return this.readBlob(id)
  }

  async delete(id: string): Promise<void> {
    this.files.delete(id)
  }

  async createFolder(parentId: string, name: string): Promise<DriveFile> {
    const existing = await this.findByName(parentId, name)
    if (existing) return existing
    const node: MockNode = { id: genId(), name, mimeType: 'application/vnd.google-apps.folder', data: new Uint8Array(), parentId }
    this.files.set(node.id, node)
    return node
  }

  async findByName(parentId: string, name: string): Promise<DriveFile | null> {
    for (const node of this.files.values()) {
      if (node.name === name && node.parentId === parentId) return node
    }
    return null
  }

  async list(parentId: string): Promise<DriveFile[]> {
    const result: DriveFile[] = []
    for (const node of this.files.values()) {
      if (node.parentId === parentId) result.push(node)
    }
    return result
  }

  async getMetadata(id: string): Promise<DriveFile> {
    const node = this.files.get(id)
    if (!node) throw new Error(`GDDB Mock: file ${id} not found`)
    return node
  }
}
