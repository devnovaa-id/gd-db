import { describe, it, expect, beforeEach } from 'vitest'
import { MockDriveAdapter } from './mock-drive.js'
import { QueryEngine } from './query-engine.js'
import { StorageEngine } from './storage.js'
import { generateMasterKey, importMasterKey } from './crypto.js'
import type { SchemaConfig } from '../shared/types.js'
import type { MasterKey } from './crypto.js'

const schema: SchemaConfig = {
  tables: {
    users: { columns: {
      id: { type: 'uuid', primaryKey: true },
      name: { type: 'text' },
      age: { type: 'number' },
      active: { type: 'bool' },
    } },
  },
  storage: { buckets: { avatars: { public: true } } },
}

describe('QueryEngine', () => {
  let engine: QueryEngine
  let mk: MasterKey

  beforeEach(async () => {
    const drive = new MockDriveAdapter()
    mk = await importMasterKey(generateMasterKey())
    const root = await drive.createFolder('root', 'gd-db')
    const tables = await drive.createFolder(root.id, 'tables')
    engine = new QueryEngine(schema, drive, tables.id, mk)
  })

  it('inserts and selects', async () => {
    await engine.execute({ table: 'users', method: 'insert', values: [{ id: '1', name: 'Alice', age: 30, active: true }] })
    const res = await engine.execute({ table: 'users', method: 'select', columns: ['*'] })
    expect(res.data).toHaveLength(1)
    expect(res.data![0].name).toBe('Alice')
    expect(res.data![0].age).toBe(30)
  })

  it('filters with eq', async () => {
    await engine.execute({ table: 'users', method: 'insert', values: [
      { id: '1', name: 'Alice', age: 30, active: true },
      { id: '2', name: 'Bob', age: 25, active: false },
    ] })
    const res = await engine.execute({ table: 'users', method: 'select', columns: ['*'], filters: [{ column: 'active', op: 'eq', value: true }] })
    expect(res.data).toHaveLength(1)
    expect(res.data![0].name).toBe('Alice')
  })

  it('updates by filter', async () => {
    await engine.execute({ table: 'users', method: 'insert', values: [{ id: '1', name: 'Alice', age: 30, active: true }] })
    await engine.execute({ table: 'users', method: 'update', values: [{ name: 'Alicia' }], filters: [{ column: 'id', op: 'eq', value: '1' }] })
    const res = await engine.execute({ table: 'users', method: 'select', columns: ['*'] })
    expect(res.data![0].name).toBe('Alicia')
  })

  it('deletes by filter', async () => {
    await engine.execute({ table: 'users', method: 'insert', values: [
      { id: '1', name: 'Alice', age: 30, active: true },
      { id: '2', name: 'Bob', age: 25, active: false },
    ] })
    await engine.execute({ table: 'users', method: 'delete', filters: [{ column: 'id', op: 'eq', value: '1' }] })
    const res = await engine.execute({ table: 'users', method: 'select', columns: ['*'] })
    expect(res.data).toHaveLength(1)
    expect(res.data![0].name).toBe('Bob')
  })

  it('upserts by primary key', async () => {
    await engine.execute({ table: 'users', method: 'insert', values: [{ id: '1', name: 'Alice', age: 30, active: true }] })
    await engine.execute({ table: 'users', method: 'upsert', values: [{ id: '1', name: 'Alice2', age: 31, active: true }], onConflict: 'id' })
    const res = await engine.execute({ table: 'users', method: 'select', columns: ['*'] })
    expect(res.data).toHaveLength(1)
    expect(res.data![0].name).toBe('Alice2')
    expect(res.data![0].age).toBe(31)
  })

  it('orders and ranges', async () => {
    await engine.execute({ table: 'users', method: 'insert', values: [
      { id: '1', name: 'A', age: 30, active: true },
      { id: '2', name: 'B', age: 25, active: true },
      { id: '3', name: 'C', age: 35, active: true },
    ] })
    const res = await engine.execute({ table: 'users', method: 'select', columns: ['*'], order: [{ column: 'age', ascending: true }], range: { from: 0, to: 1 } })
    expect(res.data).toHaveLength(2)
    expect(res.data![0].name).toBe('B')
    expect(res.data![1].name).toBe('A')
  })

  it('returns count when requested', async () => {
    await engine.execute({ table: 'users', method: 'insert', values: [
      { id: '1', name: 'A', age: 30, active: true },
      { id: '2', name: 'B', age: 25, active: true },
    ] })
    const res = await engine.execute({ table: 'users', method: 'select', columns: ['*'], count: 'exact', range: { from: 0, to: 0 } })
    expect(res.count).toBe(2)
    expect(res.data).toHaveLength(1)
  })
})

describe('StorageEngine', () => {
  let storage: StorageEngine
  let mk: MasterKey

  beforeEach(async () => {
    const drive = new MockDriveAdapter()
    mk = await importMasterKey(generateMasterKey())
    const root = await drive.createFolder('root', 'gd-db')
    const sf = await drive.createFolder(root.id, 'storage')
    storage = new StorageEngine(schema, drive, sf.id, mk)
  })

  it('uploads, downloads, lists, removes', async () => {
    const data = new TextEncoder().encode('file content')
    await storage.upload('avatars', 'test.png', data, 'image/png')
    const downloaded = await storage.download('avatars', 'test.png')
    expect(new TextDecoder().decode(downloaded)).toBe('file content')
    const listed = await storage.list('avatars')
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('test.png')
    await storage.remove('avatars', ['test.png'])
    const after = await storage.list('avatars')
    expect(after).toHaveLength(0)
  })
})
