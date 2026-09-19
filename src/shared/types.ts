export type ColumnType = 'uuid' | 'text' | 'number' | 'bool' | 'timestamptz'

export interface ColumnDef {
  type: ColumnType
  primaryKey?: boolean
  default?: string
}

export interface TableDef {
  columns: Record<string, ColumnDef>
}

export interface BucketDef {
  public?: boolean
}

export interface StorageConfig {
  buckets?: Record<string, BucketDef>
}

export interface SchemaConfig {
  tables: Record<string, TableDef>
  storage?: StorageConfig
}

export type Database = SchemaConfig

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'in'
  | 'is'
  | 'not'

export interface FilterClause {
  column: string
  op: FilterOperator
  value: unknown
  negate?: boolean
}

export interface OrClause {
  or: FilterClause[]
}

export type WhereClause = FilterClause | OrClause

export type QueryMethod = 'select' | 'insert' | 'update' | 'delete' | 'upsert'

export interface QueryDescriptor {
  table: string
  method: QueryMethod
  columns?: string[]
  filters?: WhereClause[]
  order?: { column: string; ascending: boolean }[]
  range?: { from: number; to: number }
  values?: Record<string, unknown>[]
  onConflict?: string
  count?: 'exact' | 'planned' | 'estimated'
  single?: boolean
}

export interface GdDbError {
  message: string
  code?: string
  details?: unknown
}

export interface QueryResult<T = Record<string, unknown>> {
  data: T[] | null
  error: GdDbError | null
  count: number | null
  status: number
  statusText: string
}

export interface SingleResult<T = Record<string, unknown>> {
  data: T | null
  error: GdDbError | null
  count: number | null
  status: number
  statusText: string
}

export const MAGIC = 'GDB1'
export const VERSION = 1
export const KEY_ID = 1
export const IV_LENGTH = 12
export const TAG_LENGTH = 16
export const DEK_LENGTH = 32
export const WRAPPED_DEK_LENGTH = 32 + 12 + 16
export const HEADER_LENGTH = 4 + 1 + 1 + 4
export const CHUNK_SIZE = 1024 * 1024
export const CHUNK_NONCE_LENGTH = 12
export const CHUNK_COUNTER_LENGTH = 8

export interface StoredToken {
  refreshTokenCipher: string
  rootFolderId: string
}
export type Row = Record<string, unknown>
