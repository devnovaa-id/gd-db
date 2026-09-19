import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import type { ColumnDef, SchemaConfig, TableDef, Row } from '../shared/types.js'

export function serializeRows(rows: Row[], table: TableDef): string {
  const columns = Object.keys(table.columns)
  const data = rows.map((row) => {
    const out: Record<string, string> = {}
    for (const col of columns) out[col] = serializeValue(row[col], table.columns[col])
    return out
  })
  return stringify(data, { header: true, columns })
}

export function parseCsv(csv: string, table: TableDef): Row[] {
  const records: Record<string, string>[] = parse(csv, { columns: true, skip_empty_lines: true })
  return records.map((rec) => {
    const out: Row = {}
    for (const [col, raw] of Object.entries(rec)) {
      const def = table.columns[col]
      out[col] = def ? deserializeValue(raw, def) : raw
    }
    return out
  })
}

function serializeValue(value: unknown, def: ColumnDef): string {
  if (value === null || value === undefined) return ''
  switch (def.type) {
    case 'number': return String(value)
    case 'bool': return value ? 'true' : 'false'
    case 'timestamptz': return value instanceof Date ? value.toISOString() : String(value)
    default: return String(value)
  }
}

function deserializeValue(raw: string, def: ColumnDef): unknown {
  if (raw === '') return null
  switch (def.type) {
    case 'number': return Number(raw)
    case 'bool': return raw === 'true'
    case 'timestamptz': return new Date(raw).toISOString()
    default: return raw
  }
}

export function getTable(schema: SchemaConfig, name: string): TableDef {
  const table = schema.tables[name]
  if (!table) throw new Error(`GDDB: table "${name}" not found in schema`)
  return table
}

export function getPrimaryKey(table: TableDef): string | null {
  for (const [col, def] of Object.entries(table.columns)) {
    if (def.primaryKey) return col
  }
  return null
}
