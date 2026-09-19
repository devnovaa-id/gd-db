import { z } from 'zod'

const columnTypeSchema = z.enum(['uuid', 'text', 'number', 'bool', 'timestamptz'])

const columnDefSchema = z.object({
  type: columnTypeSchema,
  primaryKey: z.boolean().optional(),
  default: z.string().optional(),
})

const tableDefSchema = z.object({
  columns: z.record(z.string(), columnDefSchema),
})

const bucketDefSchema = z.object({
  public: z.boolean().optional(),
})

const storageConfigSchema = z.object({
  buckets: z.record(z.string(), bucketDefSchema).optional(),
})

export const schemaConfigSchema = z.object({
  tables: z.record(z.string(), tableDefSchema),
  storage: storageConfigSchema.optional(),
})

export function validateSchema(config: unknown) {
  return schemaConfigSchema.parse(config)
}
