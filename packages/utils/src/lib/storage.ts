import fs from "node:fs/promises"

export interface StorageAdapter {
  uploadFile(localPath: string, remotePath: string): Promise<void>
  downloadFile(remotePath: string, localPath: string): Promise<void>
  exists(remotePath: string): Promise<boolean>
  delete(remotePath: string): Promise<void>
}

export class R2StorageAdapter implements StorageAdapter {
  constructor(private bucket: any) {}
  
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    const fileData = await fs.readFile(localPath)
    await this.bucket.put(remotePath, fileData)
  }
  
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    const object = await this.bucket.get(remotePath)
    if (object) {
      await fs.writeFile(localPath, await object.arrayBuffer())
    }
  }
  
  async exists(remotePath: string): Promise<boolean> {
    const object = await this.bucket.head(remotePath)
    return object !== null
  }
  
  async delete(remotePath: string): Promise<void> {
    await this.bucket.delete(remotePath)
  }
}

export class ExternalDatabaseAdapter implements StorageAdapter {
  constructor(private connectionString: string) {}
  
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    throw new Error('External database storage not yet implemented')
  }
  
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    throw new Error('External database storage not yet implemented')
  }
  
  async exists(remotePath: string): Promise<boolean> {
    return false
  }
  
  async delete(remotePath: string): Promise<void> {
  }
}

export function createStorageAdapter(): StorageAdapter | null {
  if (typeof globalThis !== 'undefined' && 'AGENT_STORAGE' in globalThis) {
    return new R2StorageAdapter((globalThis as any).AGENT_STORAGE)
  }
  
  if (typeof process !== 'undefined' && process.env?.DATABASE_URL) {
    return new ExternalDatabaseAdapter(process.env.DATABASE_URL)
  }
  
  return null
}
