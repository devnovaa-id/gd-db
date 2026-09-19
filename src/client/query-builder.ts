import type { QueryDescriptor, WhereClause, FilterOperator, QueryResult } from '../shared/types.js'

class ThenableQuery<T> implements PromiseLike<QueryResult<T>> {
  private descriptor: QueryDescriptor
  private transport: (desc: QueryDescriptor) => Promise<QueryResult<T>>

  constructor(descriptor: QueryDescriptor, transport: (desc: QueryDescriptor) => Promise<QueryResult<T>>) {
    this.descriptor = descriptor
    this.transport = transport
  }

  private addFilter(op: FilterOperator, column: string, value: unknown, negate = false): this {
    const filters = this.descriptor.filters ?? []
    filters.push({ column, op, value, negate } as any)
    this.descriptor.filters = filters
    return this
  }

  eq(column: string, value: unknown): this { return this.addFilter('eq', column, value) }
  neq(column: string, value: unknown): this { return this.addFilter('neq', column, value) }
  gt(column: string, value: unknown): this { return this.addFilter('gt', column, value) }
  gte(column: string, value: unknown): this { return this.addFilter('gte', column, value) }
  lt(column: string, value: unknown): this { return this.addFilter('lt', column, value) }
  lte(column: string, value: unknown): this { return this.addFilter('lte', column, value) }
  like(column: string, pattern: string): this { return this.addFilter('like', column, pattern) }
  ilike(column: string, pattern: string): this { return this.addFilter('ilike', column, pattern) }
  in(column: string, values: unknown[]): this { return this.addFilter('in', column, values) }
  is(column: string, value: unknown): this { return this.addFilter('is', column, value) }
  not(column: string, op: FilterOperator, value: unknown): this { return this.addFilter(op, column, value, true) }
  or(filters: WhereClause[]): this {
    const existing = this.descriptor.filters ?? []
    existing.push({ or: filters } as any)
    this.descriptor.filters = existing
    return this
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    const orders = this.descriptor.order ?? []
    orders.push({ column, ascending: opts?.ascending ?? true })
    this.descriptor.order = orders
    return this
  }
  range(from: number, to: number): this {
    this.descriptor.range = { from, to }
    return this
  }
  limit(count: number, opts?: { foreignTable?: string }): this {
    this.descriptor.range = { from: 0, to: count - 1 }
    return this
  }
  single(): PromiseLike<import('../shared/types.js').SingleResult<T>> {
    this.descriptor.single = true
    this.descriptor.range = { from: 0, to: 0 }
    return this.then((r) => ({ data: r.data?.[0] ?? null, error: r.error, count: r.count, status: r.status, statusText: r.statusText }))
  }
  maybeSingle(): PromiseLike<import('../shared/types.js').SingleResult<T>> {
    this.descriptor.single = true
    this.descriptor.range = { from: 0, to: 0 }
    return this.then((r) => ({ data: r.data?.[0] ?? null, error: r.error, count: r.count, status: r.status, statusText: r.statusText }))
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onFulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.transport(this.descriptor).then(onFulfilled, onRejected)
  }
}

export interface QueryBuilder<T = Record<string, unknown>> extends QueryLike<T> {
  select: (columns?: string) => QueryBuilderLike<T>
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => QueryBuilderLike<T>
  update: (values: Record<string, unknown>) => QueryBuilderLike<T>
  delete: () => QueryBuilderLike<T>
  upsert: (values: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string }) => QueryBuilderLike<T>
}

export interface QueryBuilderLike<T> extends PromiseLike<QueryResult<T>> {
  eq(column: string, value: unknown): QueryBuilderLike<T>
  neq(column: string, value: unknown): QueryBuilderLike<T>
  gt(column: string, value: unknown): QueryBuilderLike<T>
  gte(column: string, value: unknown): QueryBuilderLike<T>
  lt(column: string, value: unknown): QueryBuilderLike<T>
  lte(column: string, value: unknown): QueryBuilderLike<T>
  like(column: string, pattern: string): QueryBuilderLike<T>
  ilike(column: string, pattern: string): QueryBuilderLike<T>
  in(column: string, values: unknown[]): QueryBuilderLike<T>
  is(column: string, value: unknown): QueryBuilderLike<T>
  not(column: string, op: FilterOperator, value: unknown): QueryBuilderLike<T>
  or(filters: WhereClause[]): QueryBuilderLike<T>
  order(column: string, opts?: { ascending?: boolean }): QueryBuilderLike<T>
  range(from: number, to: number): QueryBuilderLike<T>
  limit(count: number): QueryBuilderLike<T>
  single(): PromiseLike<import('../shared/types.js').SingleResult<T>>
  maybeSingle(): PromiseLike<import('../shared/types.js').SingleResult<T>>
}

interface QueryLike<T> {}

export function createQueryBuilder<T>(
  table: string,
  transport: (desc: QueryDescriptor) => Promise<QueryResult<T>>,
): QueryBuilder<T> {
  return {
    select(columns = '*') {
      return new ThenableQuery<T>({ table, method: 'select', columns: columns.split(',').map((c) => c.trim()) }, transport) as any
    },
    insert(values) {
      const arr = Array.isArray(values) ? values : [values]
      return new ThenableQuery<T>({ table, method: 'insert', values: arr }, transport) as any
    },
    update(values) {
      return new ThenableQuery<T>({ table, method: 'update', values: [values] }, transport) as any
    },
    delete() {
      return new ThenableQuery<T>({ table, method: 'delete' }, transport) as any
    },
    upsert(values, opts) {
      const arr = Array.isArray(values) ? values : [values]
      return new ThenableQuery<T>({ table, method: 'upsert', values: arr, onConflict: opts?.onConflict }, transport) as any
    },
  }
}
