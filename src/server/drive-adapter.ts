export interface DriveFile {
  id: string
  name: string
  mimeType: string
}

export interface DriveAdapter {
  readBlob(id: string): Promise<Uint8Array>
  writeBlob(parentId: string, name: string, data: Uint8Array, mimeType?: string): Promise<DriveFile>
  upload(parentId: string, name: string, data: Uint8Array, mimeType?: string): Promise<DriveFile>
  download(id: string): Promise<Uint8Array>
  delete(id: string): Promise<void>
  createFolder(parentId: string, name: string): Promise<DriveFile>
  findByName(parentId: string, name: string): Promise<DriveFile | null>
  list(parentId: string): Promise<DriveFile[]>
  getMetadata(id: string): Promise<DriveFile>
}
