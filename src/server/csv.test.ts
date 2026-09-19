import { describe, it, expect } from 'vitest'
import { serializeRows, parseCsv } from './csv.js'
import type { SchemaConfig } from '../shared/types.js'

const schema: SchemaConfig = {
  tables: {
    items: { columns: {
      id: { type: 'uuid', primaryKey: true },
      name: { type: 'text' },
      price: { type: 'number' },
      active: { type: 'bool' },
      created_at: { type: 'timestamptz' },
    } },
  },
}

const table = schema.tables.items

describe('csv', () => {
  it('round-trips all types', () => {
    const rows = [{ id: 'abc', name: 'Widget', price: 9.99, active: true, created_at: '2026-09-19T00:00:00.000Z' }]
    const csv = serializeRows(rows, table)
    const parsed = parseCsv(csv, table)
    expect(parsed[0].id).toBe('abc')
    expect(parsed[0].price).toBe(9.99)
    expect(parsed[0].active).toBe(true)
    expect(parsed[0].created_at).toBe('2026-09-19T00:00:00.000Z') // will fail, let's check
  })

  it('handles null values', () => {
    const rows = [{ id: 'x', name: '' as any, price: 0, active: false, created_at: null as any }]
    const csv = serializeRows(rows, table)
    const parsed = parseCsv(csv, table)
    expect(parsed[0].name).toBeNull()
    expect(parsed[0].created_at).toBeNull()
  })
})
