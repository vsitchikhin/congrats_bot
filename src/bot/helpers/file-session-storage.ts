import type { StorageAdapter } from 'grammy';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Simple file-based session storage for grammY
 * Stores each session as a JSON file in the specified directory
 */
export class FileSessionStorage<T> implements StorageAdapter<T> {
  private readonly storageDir: string;

  constructor(storageDir = '.sessions') {
    this.storageDir = storageDir;
  }

  private getFilePath(key: string): string {
    // Sanitize key to be filesystem-safe
    const safeKey = key.replace(/[^\w-]/g, '_');
    return path.join(this.storageDir, `${safeKey}.json`);
  }

  async read(key: string): Promise<T | undefined> {
    try {
      const filePath = this.getFilePath(key);
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as T;
    }
    catch {
      // File doesn't exist or invalid JSON - return undefined
      return undefined;
    }
  }

  async write(key: string, value: T): Promise<void> {
    try {
      // Ensure storage directory exists
      await fs.mkdir(this.storageDir, { recursive: true });

      const filePath = this.getFilePath(key);
      const jsonData = JSON.stringify(value);

      await fs.writeFile(filePath, jsonData, 'utf-8');
    }
    catch (error) {
      console.error(`Failed to write session ${key}:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
    }
    catch {
      // Ignore if file doesn't exist
    }
  }
}
