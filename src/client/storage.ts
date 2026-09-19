import type { QueryResult } from '../shared/types.js'

export interface StorageFile {
  name: string
  id: string
  mimeType: string
  size: number
}

class BucketApi {
  constructor(private bucket: string, private baseUrl: string, private anonKey: string) {}

  async upload(path: string, file: Blob | Uint8Array | ArrayBuffer, opts?: { contentType?: string }): Promise<StorageFile> {
    const data = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : file instanceof Uint8Array ? file : new Uint8Array(file)
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${path}`, {
      method: 'POST',
      headers: this.headers(opts?.contentType),
      body: data as unknown as BodyInit,
    })
    return res.json()
  }

  async download(path: string): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${path}`, {
      headers: this.headers(),
    })
    return res.blob()
  }

  async list(prefix?: string, opts?: { limit?: number; offset?: number }): Promise<StorageFile[]> {
    const params = new URLSearchParams()
    if (prefix) params.set('prefix', prefix)
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.offset) params.set('offset', String(opts.offset))
    const res = await fetch(`${this.baseUrl}/storage/v1/list/${this.bucket}?${params}`, {
      headers: this.headers(),
    })
    return res.json()
  }

  async remove(paths: string[]): Promise<{ success: boolean }> {
    for (const p of paths) {
      await fetch(`${this.baseUrl}/storage/v1/object/${this.bucket}/${p}`, {
        method: 'DELETE',
        headers: this.headers(),
      })
    }
    return { success: true }
  }

  getPublicUrl(path: string): { data: { publicUrl: string } } {
    return { data: { publicUrl: `${this.baseUrl}/storage/v1/object/${this.bucket}/${path}` } }
  }

  private headers(contentType?: string): Record<string, string> {
    const h: Record<string, string> = { authorization: `Bearer ${this.anonKey}` }
    if (contentType) h['content-type'] = contentType
    return h
  }
}

export interface StorageApi {
  createBucket(bucket: string): Promise<{ id: string }>
  listBuckets(): string[]
  from(bucket: string): BucketApi
}

export function createStorage(baseUrl: string, anonKey: string): StorageApi {
  const buckets = new Map<string, BucketApi>()
  return {
    async createBucket(bucket: string) {
      const res = await fetch(`${this_baseUrl(baseUrl)}/storage/v1/bucket`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ bucket }),
      })
      return res.json()
    },
    listBuckets() {
      return [...buckets.keys()]
    },
    from(bucket: string) {
      let api = buckets.get(bucket)
      if (!api) {
        api = new BucketApi(bucket, baseUrl, anonKey)
        buckets.set(bucket, api)
      }
      return api
    },
  }
}

function this_baseUrl(url: string): string {
  return url
}
