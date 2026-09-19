import type { SchemaConfig } from '../shared/types.js'
import type { TokenStore } from '../server/token-store.js'

export interface HandlerConfig {
  schema: SchemaConfig
  anonKey: string
  masterKey: string
  dashboardPassword?: string
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  tokenStore?: TokenStore
  drive?: import('../server/drive-adapter.js').DriveAdapter
  rootFolderId?: string
  relayUrl?: string
}
