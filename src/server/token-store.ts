import type { StoredToken } from '../shared/types.js'
import { encryptBytes, decryptBytes, importMasterKey } from './crypto.js'

export interface TokenStore {
  get(): Promise<StoredToken | null>
  set(token: StoredToken): Promise<void>
}

export class EnvTokenStore implements TokenStore {
  private envValue: string | undefined
  private cached: StoredToken | null | undefined
  constructor(envValue: string | undefined) {
    this.envValue = envValue
  }

  async get(): Promise<StoredToken | null> {
    if (this.cached !== undefined) return this.cached
    if (!this.envValue) {
      this.cached = null
      return null
    }
    try {
      const parsed = JSON.parse(this.envValue) as StoredToken
      this.cached = parsed
      return parsed
    } catch {
      this.cached = null
      return null
    }
  }

  async set(token: StoredToken): Promise<void> {
    this.cached = token
    this.envValue = JSON.stringify(token)
  }
}

export class FileTokenStore implements TokenStore {
  constructor(private filePath: string, private masterKeyBase64?: string) {}

  async get(): Promise<StoredToken | null> {
    try {
      const { readFile } = await import('node:fs/promises')
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (this.masterKeyBase64 && parsed.encrypted) {
        const mk = await importMasterKey(this.masterKeyBase64)
        const plain = await decryptBytes(Buffer.from(parsed.encrypted, 'base64'), mk)
        return JSON.parse(new TextDecoder().decode(plain))
      }
      return parsed
    } catch {
      return null
    }
  }

  async set(token: StoredToken): Promise<void> {
    const { writeFile } = await import('node:fs/promises')
    let content: string
    if (this.masterKeyBase64) {
      const mk = await importMasterKey(this.masterKeyBase64)
      const enc = await encryptBytes(new TextEncoder().encode(JSON.stringify(token)), mk)
      content = JSON.stringify({ encrypted: Buffer.from(enc).toString('base64') })
    } else {
      content = JSON.stringify(token)
    }
    await writeFile(this.filePath, content, 'utf-8')
  }
}
