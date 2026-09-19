import { describe, it, expect, vi } from 'vitest'
import { createQueryBuilder } from './query-builder.js'
import type { QueryDescriptor } from '../shared/types.js'

describe('query builder', () => {
  it('builds select descriptor', async () => {
    const transport = vi.fn<(d: QueryDescriptor) => Promise<any>>().mockResolvedValue({ data: [], error: null, count: 0, status: 200, statusText: 'OK' })
    const qb = createQueryBuilder('users', transport)
    await qb.select('id, name').eq('active', true).order('name', { ascending: true })
    expect(transport).toHaveBeenCalledTimes(1)
    const desc = transport.mock.calls[0][0]
    expect(desc.table).toBe('users')
    expect(desc.method).toBe('select')
    expect(desc.columns).toEqual(['id', 'name'])
    expect(desc.filters).toHaveLength(1)
    expect(desc.order).toEqual([{ column: 'name', ascending: true }])
  })

  it('builds insert descriptor', async () => {
    const transport = vi.fn<(d: QueryDescriptor) => Promise<any>>().mockResolvedValue({ data: [], error: null, count: 0, status: 200, statusText: 'OK' })
    const qb = createQueryBuilder('users', transport)
    await qb.insert({ id: '1', name: 'A' })
    const desc = transport.mock.calls[0][0]
    expect(desc.method).toBe('insert')
    expect(desc.values).toEqual([{ id: '1', name: 'A' }])
  })

  it('builds update descriptor', async () => {
    const transport = vi.fn<(d: QueryDescriptor) => Promise<any>>().mockResolvedValue({ data: [], error: null, count: 0, status: 200, statusText: 'OK' })
    const qb = createQueryBuilder('users', transport)
    await qb.update({ name: 'B' }).eq('id', '1')
    const desc = transport.mock.calls[0][0]
    expect(desc.method).toBe('update')
    expect(desc.values).toEqual([{ name: 'B' }])
  })

  it('builds delete descriptor', async () => {
    const transport = vi.fn<(d: QueryDescriptor) => Promise<any>>().mockResolvedValue({ data: [], error: null, count: 0, status: 200, statusText: 'OK' })
    const qb = createQueryBuilder('users', transport)
    await qb.delete().eq('id', '1')
    const desc = transport.mock.calls[0][0]
    expect(desc.method).toBe('delete')
    expect(desc.filters).toHaveLength(1)
  })

  it('builds upsert descriptor with onConflict', async () => {
    const transport = vi.fn<(d: QueryDescriptor) => Promise<any>>().mockResolvedValue({ data: [], error: null, count: 0, status: 200, statusText: 'OK' })
    const qb = createQueryBuilder('users', transport)
    await qb.upsert({ id: '1', name: 'C' }, { onConflict: 'id' })
    const desc = transport.mock.calls[0][0]
    expect(desc.method).toBe('upsert')
    expect(desc.onConflict).toBe('id')
  })

  it('chains filters and range', async () => {
    const transport = vi.fn<(d: QueryDescriptor) => Promise<any>>().mockResolvedValue({ data: [], error: null, count: 0, status: 200, statusText: 'OK' })
    const qb = createQueryBuilder('users', transport)
    await qb.select('*').gt('age', 18).lte('age', 65).range(0, 9)
    const desc = transport.mock.calls[0][0]
    expect(desc.filters).toHaveLength(2)
    expect(desc.range).toEqual({ from: 0, to: 9 })
  })

  it('single returns one row', async () => {
    const transport = vi.fn<(d: QueryDescriptor) => Promise<any>>().mockResolvedValue({ data: [{ id: '1', name: 'A' }], error: null, count: 1, status: 200, statusText: 'OK' })
    const qb = createQueryBuilder('users', transport)
    const result = await qb.select('*').single()
    expect(result.data).toEqual({ id: '1', name: 'A' })
  })
})
