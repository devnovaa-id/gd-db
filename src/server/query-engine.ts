import type { QueryDescriptor, WhereClause, FilterClause, SchemaConfig, Row } from '../shared/types.js'
import { parseCsv, serializeRows, getTable, getPrimaryKey } from './csv.js'
import { encryptBytes, decryptBytes, importMasterKey } from './crypto.js'
import type { DriveAdapter } from './drive-adapter.js'
import type { MasterKey } from './crypto.js'

interface CacheEntry {
  rows: Row[]
  fileCacheId?: string
}

export class QueryEngine {
  private cache = new Map<string, CacheEntry>()

  constructor(
    private schema: SchemaConfig,
    private drive: DriveAdapter,
    private tablesFolderId: string,
    private masterKey: MasterKey,
  ) {}

  private async loadTable(tableName: string): Promise<{ rows: Row[]; cacheId: string }> {
    const cached = this.cache.get(tableName)
    if (cached?.fileCacheId) return { rows: cached.rows, cacheId: cached.fileCacheId }
    const table = getTable(this.schema, tableName)
    const fileName = `${tableName}.csv`
    const file = await this.drive.findByName(this.tablesFolderId, fileName)
    let rows: Row[] = []
    let cacheId = ''
    if (file) {
      const blob = await this.drive.readBlob(file.id)
      const plain = await decryptBytes(blob, this.masterKey)
      rows = parseCsv(new TextDecoder().decode(plain), table)
      cacheId = file.id
    }
    this.cache.set(tableName, { rows, fileCacheId: cacheId })
    return { rows, cacheId }
  }

  private async saveTable(tableName: string, rows: Row[]): Promise<void> {
    const table = getTable(this.schema, tableName)
    const csv = serializeRows(rows, table)
    const encrypted = await encryptBytes(new TextEncoder().encode(csv), this.masterKey)
    const file = await this.drive.writeBlob(this.tablesFolderId, `${tableName}.csv`, encrypted)
    this.cache.set(tableName, { rows, fileCacheId: file.id })
  }

  async execute(desc: QueryDescriptor): Promise<{ data: Row[] | null; count: number | null }> {
    const table = getTable(this.schema, desc.table)
    const { rows } = await this.loadTable(desc.table)
    let result: Row[] = [...rows]

    if (desc.method === 'insert') {
      const newRows = desc.values ?? []
      result = [...rows, ...newRows]
      await this.saveTable(desc.table, result)
      return { data: newRows, count: desc.count ? result.length : null }
    }

    if (desc.method === 'upsert') {
      const pk = desc.onConflict ?? getPrimaryKey(table) ?? ''
      const incoming = desc.values ?? []
      const map = new Map<string, Row>()
      for (const r of rows) map.set(String(r[pk]), r)
      const upserted: Row[] = []
      for (const v of incoming) {
        const key = String(v[pk])
        const existing = map.get(key)
        const merged = existing ? { ...existing, ...v } : v
        map.set(key, merged)
        upserted.push(merged)
      }
      result = [...map.values()]
      await this.saveTable(desc.table, result)
      return { data: upserted, count: desc.count ? result.length : null }
    }

    if (desc.method === 'update') {
      const values = desc.values?.[0] ?? {}
      const matched = result.filter((r) => matchesFilters(r, desc.filters ?? []))
      for (const r of matched) Object.assign(r, values)
      await this.saveTable(desc.table, result)
      return { data: matched, count: desc.count ? result.length : null }
    }

    if (desc.method === 'delete') {
      const matched = result.filter((r) => matchesFilters(r, desc.filters ?? []))
      const matchedSet = new Set(matched)
      result = result.filter((r) => !matchedSet.has(r))
      await this.saveTable(desc.table, result)
      return { data: matched, count: desc.count ? result.length : null }
    }

    // select
    result = result.filter((r) => matchesFilters(r, desc.filters ?? []))
    if (desc.order) {
      for (const ord of [...desc.order].reverse()) {
        result.sort((a, b) => compare(a[ord.column], b[ord.column], ord.ascending))
      }
    }
    const totalCount = result.length
    if (desc.range) {
      result = result.slice(desc.range.from, desc.range.to + 1)
    }
    if (desc.columns && !desc.columns.includes('*')) {
      result = result.map((r) => {
        const out: Row = {}
        for (const c of desc.columns!) out[c] = r[c]
        return out
      })
    }
    return { data: result, count: desc.count === 'exact' ? totalCount : null }
  }
}

export function matchesFilters(row: Row, filters: WhereClause[]): boolean {
  return filters.every((f) => matchClause(row, f))
}

function matchClause(row: Row, clause: WhereClause): boolean {
  if ('or' in clause) return clause.or.some((c) => matchClause(row, c))
  return matchOperator(row, clause)
}

function matchOperator(row: Row, clause: FilterClause): boolean {
  const val: any = row[clause.column]
  const target: any = clause.value
  let result: boolean
  switch (clause.op) {
    case 'eq': result = val === target; break
    case 'neq': result = val !== target; break
    case 'gt': result = val !== null && val > target; break
    case 'gte': result = val !== null && val >= target; break
    case 'lt': result = val !== null && val < target; break
    case 'lte': result = val !== null && val <= target; break
    case 'like': result = typeof val === 'string' && likeMatch(val, String(target)); break
    case 'ilike': result = typeof val === 'string' && likeMatch(val.toLowerCase(), String(target).toLowerCase()); break
    case 'in': result = Array.isArray(target) && target.includes(val); break
    case 'is': result = (target === null && val === null) || (target !== null && val === target); break
    case 'not': result = val !== target; break
    default: result = false
  }
  return clause.negate ? !result : result
}

function likeMatch(str: string, pattern: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$')
  return regex.test(str)
}

function compare(a: any, b: any, ascending: boolean): number {
  if (a === null && b === null) return 0
  if (a === null) return ascending ? -1 : 1
  if (b === null) return ascending ? 1 : -1
  if (a < b) return ascending ? -1 : 1
  if (a > b) return ascending ? 1 : -1
  return 0
}
