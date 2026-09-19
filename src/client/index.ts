import type { QueryDescriptor, QueryResult, Database } from '../shared/types.js'
import { createQueryBuilder } from './query-builder.js'
import type { QueryBuilder } from './query-builder.js'
import { createStorage } from './storage.js'
import type { StorageApi } from './storage.js'

export interface GdDbClient<DB extends Database = Database> {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>
  storage: StorageApi
}

export function createClient<DB extends Database = Database>(url: string, anonKey: string): GdDbClient<DB> {
  async function transport(desc: QueryDescriptor): Promise<QueryResult> {
    try {
      const res = await fetch(`${url}/rest/v1/${desc.table}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${anonKey}` },
        body: JSON.stringify(desc),
      })
      const body = await res.json()
      return { data: body.data ?? null, error: body.error ?? null, count: body.count ?? null, status: res.status, statusText: res.statusText }
    } catch (e) {
      return { data: null, error: { message: (e as Error).message }, count: null, status: 0, statusText: 'Network Error' }
    }
  }

  return {
    from: <T>(table: string) => createQueryBuilder<T>(table, transport as any),
    storage: createStorage(url, anonKey),
  }
}

export type { GdDbClient as SupabaseClient } from './index.js'
export { createStorage } from './storage.js'
