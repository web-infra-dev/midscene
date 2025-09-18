import type { InfoListItem, StorageProvider } from '../../../types';
import {
  MemoryStorageProvider as IndexedDBMemoryStorageProvider,
  NoOpStorageProvider as IndexedDBNoOpStorageProvider,
  IndexedDBStorageProvider,
} from './indexeddb-storage-provider';

/**
 * Local Storage implementation for playground message persistence
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly messagesKey: string;
  private readonly resultsKey: string;
  private readonly maxStorageItems = 50; // Limit stored items to prevent quota issues

  constructor(namespace = 'playground') {
    this.messagesKey = `${namespace}-messages`;
    this.resultsKey = `${namespace}-results`;
  }

  /**
   * Check available storage space
   */
  private checkStorageSpace(): boolean {
    try {
      const testKey = 'storage-test';
      const testData = 'x'.repeat(1024 * 100); // 100KB test
      localStorage.setItem(testKey, testData);
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  async saveMessages(messages: InfoListItem[]): Promise<void> {
    try {
      // Check storage space before attempting to save
      if (!this.checkStorageSpace()) {
        console.warn('Low storage space detected, clearing old data...');
        await this.handleQuotaExceeded();
      }

      // Limit messages to prevent quota issues - keep only recent messages
      const messagesToSave = messages.slice(-this.maxStorageItems);

      // Only save light message data (exclude heavy result data)
      const lightMessages = messagesToSave.map((msg) => ({
        ...msg,
        result: undefined, // Remove heavy result data
      }));

      const messageData = JSON.stringify(lightMessages);
      localStorage.setItem(this.messagesKey, messageData);
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'QuotaExceededError'
      ) {
        console.warn(
          'LocalStorage quota exceeded, attempting to clear old data and retry...',
        );
        await this.handleQuotaExceeded();

        try {
          // Retry with only recent messages
          const recentMessages = messages.slice(-10); // Keep only last 10 messages
          const lightRecentMessages = recentMessages.map((msg) => ({
            ...msg,
            result: undefined,
          }));

          const messageData = JSON.stringify(lightRecentMessages);
          localStorage.setItem(this.messagesKey, messageData);
          console.info(
            'Successfully saved recent messages after clearing storage',
          );
        } catch (retryError) {
          console.error(
            'Failed to save even after clearing storage:',
            retryError,
          );
          // Fallback: clear all messages and start fresh
          await this.clearMessages();
        }
      } else {
        console.error('Failed to save messages to localStorage:', error);
      }
    }
  }

  async loadMessages(): Promise<InfoListItem[]> {
    try {
      const stored = localStorage.getItem(this.messagesKey);
      if (!stored) return [];

      const messages = JSON.parse(stored) as InfoListItem[];

      // Restore result data from separate storage
      const restoredMessages = await Promise.all(
        messages.map(async (msg) => {
          if (msg.type === 'result' && msg.id) {
            const resultKey = `${this.resultsKey}-${msg.id}`;
            const storedResult = localStorage.getItem(resultKey);
            if (storedResult) {
              try {
                const resultItem = JSON.parse(storedResult) as InfoListItem;
                return { ...msg, ...resultItem };
              } catch (e) {
                console.warn('Failed to parse stored result:', e);
              }
            }
          }
          return msg;
        }),
      );

      return restoredMessages;
    } catch (error) {
      console.error('Failed to load messages from localStorage:', error);
      return [];
    }
  }

  async clearMessages(): Promise<void> {
    try {
      localStorage.removeItem(this.messagesKey);

      // Also clear all result data
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(this.resultsKey)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Failed to clear messages from localStorage:', error);
    }
  }

  async saveResult(id: string, result: InfoListItem): Promise<void> {
    try {
      const resultKey = `${this.resultsKey}-${id}`;
      localStorage.setItem(resultKey, JSON.stringify(result));
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === 'QuotaExceededError'
      ) {
        console.warn(
          'LocalStorage quota exceeded when saving result, clearing old results...',
        );
        await this.handleQuotaExceeded();

        try {
          // Retry saving the result
          const resultKey = `${this.resultsKey}-${id}`;
          localStorage.setItem(resultKey, JSON.stringify(result));
        } catch (retryError) {
          console.error(
            'Failed to save result even after clearing storage:',
            retryError,
          );
        }
      } else {
        console.error('Failed to save result to localStorage:', error);
      }
    }
  }

  /**
   * Handle quota exceeded by clearing old data
   */
  private async handleQuotaExceeded(): Promise<void> {
    try {
      // Clear old result data first (usually the largest)
      const keys = Object.keys(localStorage);
      const resultKeys = keys.filter((key) => key.startsWith(this.resultsKey));

      // Sort by timestamp if possible, otherwise clear half of them
      const keysToRemove = resultKeys.slice(
        0,
        Math.max(1, Math.floor(resultKeys.length / 2)),
      );

      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });

      console.info(
        `Cleared ${keysToRemove.length} old result entries to free up storage space`,
      );

      // If still having issues, clear other playground-related data
      const playgroundKeys = keys.filter(
        (key) =>
          key.includes('playground') ||
          key.includes('agent') ||
          key.startsWith('midscene'),
      );

      if (playgroundKeys.length > 10) {
        const additionalKeysToRemove = playgroundKeys.slice(
          0,
          Math.floor(playgroundKeys.length / 3),
        );
        additionalKeysToRemove.forEach((key) => {
          if (key !== this.messagesKey) {
            // Don't remove current messages
            localStorage.removeItem(key);
          }
        });
        console.info(
          `Cleared ${additionalKeysToRemove.length} additional playground-related entries`,
        );
      }
    } catch (error) {
      console.error('Failed to handle quota exceeded:', error);
    }
  }
}

/**
 * Memory-only storage implementation for non-persistent scenarios
 */
export class MemoryStorageProvider implements StorageProvider {
  private messages: InfoListItem[] = [];
  private results = new Map<string, InfoListItem>();

  async saveMessages(messages: InfoListItem[]): Promise<void> {
    this.messages = [...messages];
  }

  async loadMessages(): Promise<InfoListItem[]> {
    return [...this.messages];
  }

  async clearMessages(): Promise<void> {
    this.messages = [];
    this.results.clear();
  }

  async saveResult(id: string, result: InfoListItem): Promise<void> {
    this.results.set(id, result);
  }
}

/**
 * No-op storage implementation for cases where persistence is disabled
 */
export class NoOpStorageProvider implements StorageProvider {
  async saveMessages(_messages: InfoListItem[]): Promise<void> {
    // No-op
  }

  async loadMessages(): Promise<InfoListItem[]> {
    return [];
  }

  async clearMessages(): Promise<void> {
    // No-op
  }

  async saveResult(_id: string, _result: InfoListItem): Promise<void> {
    // No-op
  }
}

/**
 * Storage type enumeration
 */
export enum StorageType {
  INDEXEDDB = 'indexeddb',
  LOCALSTORAGE = 'localStorage',
  MEMORY = 'memory',
  NONE = 'none',
}

/**
 * Factory function to create the appropriate storage provider
 */
export function createStorageProvider(
  type: StorageType = StorageType.INDEXEDDB,
  namespace = 'playground',
): StorageProvider {
  switch (type) {
    case StorageType.INDEXEDDB:
      if (typeof indexedDB !== 'undefined') {
        return new IndexedDBStorageProvider(namespace);
      }
      // Fallback to localStorage if IndexedDB is not available
      console.warn('IndexedDB not available, falling back to localStorage');
      return createStorageProvider(StorageType.LOCALSTORAGE, namespace);

    case StorageType.LOCALSTORAGE:
      if (typeof localStorage !== 'undefined') {
        return new LocalStorageProvider(namespace);
      }
      // Fallback to memory if localStorage is not available
      console.warn(
        'localStorage not available, falling back to memory storage',
      );
      return createStorageProvider(StorageType.MEMORY, namespace);

    case StorageType.MEMORY:
      return new MemoryStorageProvider();

    case StorageType.NONE:
      return new NoOpStorageProvider();

    default:
      throw new Error(`Unknown storage type: ${type}`);
  }
}

// Helper function to detect best available storage
export function detectBestStorageType(): StorageType {
  // Check IndexedDB availability
  if (typeof indexedDB !== 'undefined') {
    try {
      // Try to access IndexedDB
      indexedDB.open('test', 1).onerror = () => {}; // Silent test
      return StorageType.INDEXEDDB;
    } catch {
      // IndexedDB blocked or unavailable
    }
  }

  // Check localStorage availability
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('test', 'test');
      localStorage.removeItem('test');
      return StorageType.LOCALSTORAGE;
    } catch {
      // localStorage blocked or unavailable
    }
  }

  // Fallback to memory storage
  return StorageType.MEMORY;
}

// Export the new IndexedDB providers as primary options
export {
  IndexedDBStorageProvider,
  IndexedDBMemoryStorageProvider,
  IndexedDBNoOpStorageProvider,
};
