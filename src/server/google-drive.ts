import type { DriveAdapter, DriveFile } from './drive-adapter.js'

interface OAuthToken {
  access_token: string
  expiry_date?: number
  refresh_token?: string
}

export interface GoogleDriveConfig {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export class GoogleDriveAdapter implements DriveAdapter {
  private drive: any
  private oauth2Client: any

  constructor(config: GoogleDriveConfig) {
    const { google } = require('googleapis')
    this.oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret)
    this.oauth2Client.setCredentials({ refresh_token: config.refreshToken })
    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client })
  }

  async readBlob(id: string): Promise<Uint8Array> {
    const res = await this.drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer' })
    return new Uint8Array(res.data)
  }

  async writeBlob(parentId: string, name: string, data: Uint8Array, mimeType = 'application/octet-stream'): Promise<DriveFile> {
    const existing = await this.findByName(parentId, name)
    if (existing) {
      await this.drive.files.update({ fileId: existing.id, media: { body: this.toStream(data), mimeType } })
      return existing
    }
    return this.upload(parentId, name, data, mimeType)
  }

  async upload(parentId: string, name: string, data: Uint8Array, mimeType = 'application/octet-stream'): Promise<DriveFile> {
    const res = await this.drive.files.create({
      requestBody: { name, parents: [parentId] },
      media: { body: this.toStream(data), mimeType },
      fields: 'id,name,mimeType',
    })
    return res.data
  }

  async download(id: string): Promise<Uint8Array> {
    return this.readBlob(id)
  }

  async delete(id: string): Promise<void> {
    await this.drive.files.delete({ fileId: id })
  }

  async createFolder(parentId: string, name: string): Promise<DriveFile> {
    const existing = await this.findByName(parentId, name)
    if (existing) return existing
    const res = await this.drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id,name,mimeType',
    })
    return res.data
  }

  async findByName(parentId: string, name: string): Promise<DriveFile | null> {
    const res = await this.drive.files.list({
      q: `'${parentId}' in parents and name='${name}' and trashed=false`,
      fields: 'files(id,name,mimeType)',
      pageSize: 1,
    })
    return res.data.files?.[0] ?? null
  }

  async list(parentId: string): Promise<DriveFile[]> {
    const res = await this.drive.files.list({
      q: `'${parentId}' in parents and trashed=false`,
      fields: 'files(id,name,mimeType)',
    })
    return res.data.files ?? []
  }

  async getMetadata(id: string): Promise<DriveFile> {
    const res = await this.drive.files.get({ fileId: id, fields: 'id,name,mimeType' })
    return res.data
  }

  private toStream(data: Uint8Array): any {
    const { Readable } = require('node:stream')
    return Readable.from(Buffer.from(data))
  }
}

export function exchangeCodeForToken(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<OAuthToken> {
  const { google } = require('googleapis')
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  return client.getToken(code).then((r: any) => r.tokens)
}

export function getAuthUrl(clientId: string, redirectUri: string): string {
  const { google } = require('googleapis')
  const client = new google.auth.OAuth2(clientId, '', redirectUri)
  return client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/drive'], prompt: 'consent' })
}
