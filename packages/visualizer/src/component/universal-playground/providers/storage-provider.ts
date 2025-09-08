import type { InfoListItem, StorageProvider } from '../types';

/**
 * Local Storage implementation for playground message persistence
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly messagesKey: string;
  private readonly resultsKey: string;

  constructor(namespace = 'playground') {
    this.messagesKey = `${namespace}-messages`;
    this.resultsKey = `${namespace}-results`;
  }

  async saveMessages(messages: InfoListItem[]): Promise<void> {
    try {
      // Only save light message data (exclude heavy result data)
      const lightMessages = messages.map((msg) => ({
        ...msg,
        result: undefined, // Remove heavy result data
      }));

      localStorage.setItem(this.messagesKey, JSON.stringify(lightMessages));
    } catch (error) {
      console.error('Failed to save messages to localStorage:', error);
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
      console.error('Failed to save result to localStorage:', error);
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
