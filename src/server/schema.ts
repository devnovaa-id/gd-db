import type { SchemaConfig } from '../shared/types.js'
import { validateSchema } from '../shared/validation.js'

export function defineSchema(config: SchemaConfig): SchemaConfig {
  return validateSchema(config)
}
