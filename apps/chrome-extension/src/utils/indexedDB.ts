import type { RecordingSession } from '../store';

const DB_NAME = 'midscene-recorder';
const DB_VERSION = 2;
const SESSIONS_STORE = 'recording-sessions';
const CONFIG_STORE = 'config';

// Session limit configuration
const MAX_SESSIONS = 5;

interface DBConfig {
  currentSessionId: string | null;
  isRecording: boolean;
  // Navigation recovery fields
  wasRecordingBeforeNavigation?: boolean;
  lastRecordingTabId?: number;
  lastRecordingUrl?: string;
  lastRecordingSessionId?: string;
  lastNavigationTime?: number;
}

class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;
  private isHealthy = true;

  async init(): Promise<void> {
    // Prevent duplicate initialization
    if (this.isInitialized && this.isHealthy) {
      return;
    }

    // If already initializing, return existing Promise
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInit();
    try {
      await this.initPromise;
      this.isInitialized = true;
      this.isHealthy = true;
    } catch (error) {
      // Reset Promise on failure for retry
      this.initPromise = null;
      this.isHealthy = false;
      throw error;
    }
  }

  // Health check method
  private async healthCheck(): Promise<boolean> {
    if (!this.db || !this.isInitialized) {
      return false;
    }

    try {
      // Simple read test
      await this.getConfig();
      this.isHealthy = true;
      return true;
    } catch (error) {
      console.warn('IndexedDB health check failed:', error);
      this.isHealthy = false;
      return false;
    }
  }

  private async _doInit(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB open error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;

        // Add database error handling
        this.db.onerror = (event) => {
          console.error('IndexedDB error:', event);
        };

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create sessions store
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const sessionsStore = db.createObjectStore(SESSIONS_STORE, {
            keyPath: 'id',
          });
          sessionsStore.createIndex('createdAt', 'createdAt', {
            unique: false,
          });
          sessionsStore.createIndex('updatedAt', 'updatedAt', {
            unique: false,
          });
        }

        // Create config store
        if (!db.objectStoreNames.contains(CONFIG_STORE)) {
          db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  private ensureDB(): IDBDatabase {
    if (!this.db || !this.isInitialized || !this.isHealthy) {
      throw new Error(
        'Database not initialized or unhealthy. Call init() first.',
      );
    }
    return this.db;
  }

  // Safe database operation wrapper
  private async safeDBOperation<T>(
    operation: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      // Health check
      if (!this.isHealthy) {
        const isHealthy = await this.healthCheck();
        if (!isHealthy) {
          throw new Error('Database is unhealthy');
        }
      }

      return await operation();
    } catch (error) {
      console.error('Database operation failed:', error);
      this.isHealthy = false;
      return fallback;
    }
  }

  // Create Promise wrapper with timeout
  private createTimeoutPromise<T>(
    promiseExecutor: (
      resolve: (value: T) => void,
      reject: (reason?: any) => void,
    ) => void,
    timeoutMs = 10000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`IndexedDB operation timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Wrap original resolve and reject
      const wrappedResolve = (value: T) => {
        clearTimeout(timeoutId);
        resolve(value);
      };

      const wrappedReject = (reason?: any) => {
        clearTimeout(timeoutId);
        reject(reason);
      };

      try {
        promiseExecutor(wrappedResolve, wrappedReject);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  // Session management
  async getAllSessions(): Promise<RecordingSession[]> {
    return this.safeDBOperation(async () => {
      await this.init();
      const db = this.ensureDB();

      return this.createTimeoutPromise<RecordingSession[]>(
        (resolve, reject) => {
          const transaction = db.transaction([SESSIONS_STORE], 'readonly');

          // Add transaction error handling
          transaction.onerror = () => {
            console.error(
              'Transaction error in getAllSessions:',
              transaction.error,
            );
            reject(transaction.error);
          };

          transaction.onabort = () => {
            console.error('Transaction aborted in getAllSessions');
            reject(new Error('Transaction aborted'));
          };

          const store = transaction.objectStore(SESSIONS_STORE);
          const index = store.index('updatedAt');
          const request = index.getAll();

          request.onsuccess = () => {
            try {
              // Sort by updatedAt descending (newest first)
              const sessions = request.result.sort(
                (a, b) => b.updatedAt - a.updatedAt,
              );
              resolve(sessions);
            } catch (error) {
              reject(error);
            }
          };

          request.onerror = () => {
            console.error('Request error in getAllSessions:', request.error);
            reject(request.error);
          };
        },
      );
    }, []);
  }

  async getSession(id: string): Promise<RecordingSession | null> {
    return this.safeDBOperation(async () => {
      await this.init();
      const db = this.ensureDB();

      return this.createTimeoutPromise<RecordingSession | null>(
        (resolve, reject) => {
          const transaction = db.transaction([SESSIONS_STORE], 'readonly');

          transaction.onerror = () => {
            console.error(
              'Transaction error in getSession:',
              transaction.error,
            );
            reject(transaction.error);
          };

          transaction.onabort = () => {
            console.error('Transaction aborted in getSession');
            reject(new Error('Transaction aborted'));
          };

          const store = transaction.objectStore(SESSIONS_STORE);
          const request = store.get(id);

          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => {
            console.error('Request error in getSession:', request.error);
            reject(request.error);
          };
        },
      );
    }, null);
  }

  async addSession(session: RecordingSession): Promise<void> {
    await this.init();
    const db = this.ensureDB();

    // First, check if we need to remove old sessions
    const sessions = await this.getAllSessions();
    if (sessions.length >= MAX_SESSIONS) {
      // Remove oldest sessions to make room
      const sessionsToRemove = sessions
        .slice(MAX_SESSIONS - 1)
        .map((s) => s.id);

      for (const sessionId of sessionsToRemove) {
        await this.deleteSession(sessionId);
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE);
      const request = store.add(session);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateSession(
    sessionId: string,
    updates: Partial<RecordingSession>,
  ): Promise<void> {
    await this.init();
    const db = this.ensureDB();
    let existingSession = await this.getSession(sessionId);

    // If session doesn't exist, create a basic session structure
    if (!existingSession) {
      console.warn(
        `Session ${sessionId} not found, creating new session with updates`,
      );
      existingSession = {
        id: sessionId,
        name: `Session ${new Date().toLocaleString()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        events: [],
        status: 'idle' as const,
        ...updates, // Apply the updates to the new session
      };
    } else {
      // Merge updates with existing session
      existingSession = {
        ...existingSession,
        ...updates,
        updatedAt: Date.now(),
      };
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE);
      const request = store.put(existingSession);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.init();
      const db = this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([SESSIONS_STORE], 'readwrite');
        const store = transaction.objectStore(SESSIONS_STORE);
        const request = store.delete(sessionId);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }

  // Config management
  async getConfig(): Promise<DBConfig> {
    try {
      await this.init();
      const db = this.ensureDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONFIG_STORE], 'readonly');
        const store = transaction.objectStore(CONFIG_STORE);
        const request = store.get('config');

        request.onsuccess = () => {
          const result = request.result;
          resolve(
            result?.value || {
              currentSessionId: null,
              isRecording: false,
              wasRecordingBeforeNavigation: false,
              lastRecordingTabId: undefined,
              lastRecordingUrl: undefined,
              lastRecordingSessionId: undefined,
              lastNavigationTime: undefined,
            },
          );
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to get config:', error);
      return {
        currentSessionId: null,
        isRecording: false,
        wasRecordingBeforeNavigation: false,
        lastRecordingTabId: undefined,
        lastRecordingUrl: undefined,
        lastRecordingSessionId: undefined,
        lastNavigationTime: undefined,
      };
    }
  }

  async setConfig(config: Partial<DBConfig>): Promise<void> {
    try {
      await this.init();
      const db = this.ensureDB();
      const currentConfig = await this.getConfig();
      const newConfig = { ...currentConfig, ...config };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONFIG_STORE], 'readwrite');
        const store = transaction.objectStore(CONFIG_STORE);
        const request = store.put({ key: 'config', value: newConfig });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to set config:', error);
    }
  }

  async getCurrentSessionId(): Promise<string | null> {
    const config = await this.getConfig();
    return config.currentSessionId;
  }

  async setCurrentSessionId(sessionId: string | null): Promise<void> {
    await this.setConfig({ currentSessionId: sessionId });
  }

  async getRecordingState(): Promise<boolean> {
    const config = await this.getConfig();
    return config.isRecording;
  }

  async setRecordingState(isRecording: boolean): Promise<void> {
    await this.setConfig({ isRecording });
  }

  // Clear navigation recovery state
  async clearNavigationRecoveryState(): Promise<void> {
    await this.setConfig({
      wasRecordingBeforeNavigation: false,
      lastRecordingTabId: undefined,
      lastRecordingUrl: undefined,
      lastRecordingSessionId: undefined,
      lastNavigationTime: undefined,
    });
  }

  // Recording events management (temporary storage during recording)
  async getRecordingEvents(): Promise<any[]> {
    return this.safeDBOperation(async () => {
      await this.init();
      const db = this.ensureDB();

      return this.createTimeoutPromise<any[]>((resolve, reject) => {
        const transaction = db.transaction([CONFIG_STORE], 'readonly');

        transaction.onerror = () => {
          console.error(
            'Transaction error in getRecordingEvents:',
            transaction.error,
          );
          reject(transaction.error);
        };

        const store = transaction.objectStore(CONFIG_STORE);
        const request = store.get('recording-events');

        request.onsuccess = () => {
          const result = request.result;
          resolve(result?.value || []);
        };
        request.onerror = () => {
          console.error('Request error in getRecordingEvents:', request.error);
          reject(request.error);
        };
      });
    }, []);
  }

  async setRecordingEvents(events: any[]): Promise<void> {
    try {
      await this.init();
      const db = this.ensureDB();

      return this.createTimeoutPromise<void>((resolve, reject) => {
        const transaction = db.transaction([CONFIG_STORE], 'readwrite');

        // Add transaction error handling
        transaction.onerror = () => {
          console.error(
            'Transaction error in setRecordingEvents:',
            transaction.error,
          );
          reject(transaction.error);
        };

        transaction.onabort = () => {
          console.error('Transaction aborted in setRecordingEvents');
          reject(new Error('Transaction aborted'));
        };

        const store = transaction.objectStore(CONFIG_STORE);
        const request = store.put({ key: 'recording-events', value: events });

        request.onsuccess = () => resolve();
        request.onerror = () => {
          console.error('Request error in setRecordingEvents:', request.error);
          reject(request.error);
        };
      }, 5000); // Shorter timeout for events during navigation
    } catch (error) {
      console.error('Failed to set recording events:', error);
      // Don't throw error during navigation to prevent hanging
    }
  }

  // Emergency method for saving events during navigation with minimal timeout
  async emergencySetRecordingEvents(events: any[]): Promise<void> {
    try {
      await this.init();
      const db = this.ensureDB();

      return this.createTimeoutPromise<void>((resolve, reject) => {
        const transaction = db.transaction([CONFIG_STORE], 'readwrite');

        // Immediate resolution on transaction complete for faster response
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(new Error('Transaction aborted'));

        const store = transaction.objectStore(CONFIG_STORE);
        const request = store.put({ key: 'recording-events', value: events });

        request.onerror = () => reject(request.error);
      }, 2000); // Very short timeout for emergency saves
    } catch (error) {
      console.error('Failed to emergency save recording events:', error);
      // Fail silently during navigation
    }
  }

  async clearRecordingEvents(): Promise<void> {
    try {
      await this.init();
      const db = this.ensureDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONFIG_STORE], 'readwrite');
        const store = transaction.objectStore(CONFIG_STORE);
        const request = store.delete('recording-events');

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Failed to clear recording events:', error);
    }
  }
}

// Singleton instance
export const dbManager = new IndexedDBManager();

// Global initialization state tracking
let isGloballyInitialized = false;
let globalInitPromise: Promise<void> | null = null;

// Initialize the database
export const initializeDB = async (): Promise<void> => {
  // Prevent duplicate initialization
  if (isGloballyInitialized) {
    return;
  }

  // If already initializing, return existing Promise
  if (globalInitPromise) {
    return globalInitPromise;
  }

  globalInitPromise = (async () => {
    try {
      await dbManager.init();
      // Only execute migration on first initialization
      if (!isGloballyInitialized) {
        isGloballyInitialized = true;
      }
    } catch (error) {
      // Reset state on initialization failure for retry
      globalInitPromise = null;
      console.error('Failed to initialize IndexedDB:', error);
      throw error;
    }
  })();

  return globalInitPromise;
};
