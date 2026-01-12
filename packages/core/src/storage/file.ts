import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { uuid } from '@midscene/shared/utils';
import type { StorageProvider } from './provider';

export class FileStorage implements StorageProvider {
  readonly type = 'file' as const;
  private directory: string;
  private registry = new Map<string, string>();

  constructor(baseDir?: string) {
    this.directory =
      baseDir || path.join(tmpdir(), 'midscene-screenshots', uuid());
    mkdirSync(this.directory, { recursive: true });
  }

  async store(data: string): Promise<string> {
    const id = uuid();
    const filePath = path.join(this.directory, `${id}.b64`);
    writeFileSync(filePath, data, 'utf-8');
    this.registry.set(id, filePath);
    return id;
  }

  async storeWithId(id: string, data: string): Promise<void> {
    const filePath = path.join(this.directory, `${id}.b64`);
    writeFileSync(filePath, data, 'utf-8');
    this.registry.set(id, filePath);
  }

  async retrieve(id: string): Promise<string> {
    const filePath = this.registry.get(id);
    if (!filePath) {
      throw new Error(`FileStorage: File not found for id: ${id}`);
    }
    if (!existsSync(filePath)) {
      throw new Error(`FileStorage: File does not exist: ${filePath}`);
    }
    return readFileSync(filePath, 'utf-8');
  }

  async delete(id: string): Promise<void> {
    const filePath = this.registry.get(id);
    if (filePath && existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch {
        // Ignore deletion errors
      }
    }
    this.registry.delete(id);
  }

  async cleanup(): Promise<void> {
    if (existsSync(this.directory)) {
      try {
        rmSync(this.directory, { recursive: true, force: true });
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
