import { uuid } from '@midscene/shared/utils';
import type { StorageProvider } from './provider';

export class MemoryStorage implements StorageProvider {
  readonly type = 'memory' as const;
  private dataStore = new Map<string, string>();

  async store(data: string): Promise<string> {
    const id = uuid();
    this.dataStore.set(id, data);
    return id;
  }

  async retrieve(id: string): Promise<string> {
    const data = this.dataStore.get(id);
    if (data === undefined) {
      throw new Error(`MemoryStorage: Data not found for id: ${id}`);
    }
    return data;
  }

  async delete(id: string): Promise<void> {
    this.dataStore.delete(id);
  }

  async cleanup(): Promise<void> {
    this.dataStore.clear();
  }

  get size(): number {
    return this.dataStore.size;
  }
}
