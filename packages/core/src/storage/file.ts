import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uuid } from '@midscene/shared/utils';
import type { StorageProvider } from './provider';

/**
 * Default file path resolver for Node.js environments.
 * Resolves relative paths to absolute and validates file existence.
 *
 * @param filePath - The file path to resolve
 * @returns The absolute path if file exists
 * @throws Error if file does not exist
 */
export function defaultFilePathResolver(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return absolutePath;
}

/**
 * File-based storage provider for Node.js environments.
 * Stores screenshot data as files on disk.
 *
 * @example
 * ```typescript
 * // Create with auto-generated temp directory
 * const storage = new FileStorage();
 *
 * // Create with custom directory
 * const storage = new FileStorage('/path/to/screenshots');
 * ```
 */
export class FileStorage implements StorageProvider {
  readonly type = 'file' as const;
  private directory: string;
  private registry = new Map<string, string>();

  /**
   * Create a FileStorage instance.
   * @param baseDir - Optional base directory for storing files.
   *                  If not provided, uses a temp directory.
   */
  constructor(baseDir?: string) {
    this.directory =
      baseDir || path.join(os.tmpdir(), 'midscene-screenshots', uuid());
    fs.mkdirSync(this.directory, { recursive: true });
  }

  async store(data: string): Promise<string> {
    const id = uuid();
    const filePath = path.join(this.directory, `${id}.b64`);
    // Using sync API for simplicity and atomicity - screenshot storage is typically
    // called sequentially and the overhead of async I/O scheduling outweighs benefits
    fs.writeFileSync(filePath, data, 'utf-8');
    this.registry.set(id, filePath);
    return id;
  }

  async storeWithId(id: string, data: string): Promise<void> {
    const filePath = path.join(this.directory, `${id}.b64`);
    fs.writeFileSync(filePath, data, 'utf-8');
    this.registry.set(id, filePath);
  }

  async retrieve(id: string): Promise<string> {
    const filePath = this.registry.get(id);
    if (!filePath) {
      throw new Error(`FileStorage: File not found for id: ${id}`);
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`FileStorage: File does not exist: ${filePath}`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  async delete(id: string): Promise<void> {
    const filePath = this.registry.get(id);
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore deletion errors
      }
    }
    this.registry.delete(id);
  }

  async cleanup(): Promise<void> {
    if (fs.existsSync(this.directory)) {
      try {
        fs.rmSync(this.directory, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    this.registry.clear();
  }

  getDirectory(): string {
    return this.directory;
  }

  get size(): number {
    return this.registry.size;
  }
}
