import type { RecordingSession } from '../store';

const DB_NAME = 'midscene-recorder';
const DB_VERSION = 1;
const SESSIONS_STORE = 'recording-sessions';
const CONFIG_STORE = 'config';

// Session limit configuration
const MAX_SESSIONS = 5;

interface DBConfig {
  currentSessionId: string | null;
  isRecording: boolean;
}

class IndexedDBManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;
  private isHealthy = true;

  async init(): Promise<void> {
    // 防止重复初始化
    if (this.isInitialized && this.isHealthy) {
      return;
    }
    
    // 如果正在初始化，返回现有的Promise
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInit();
    try {
      await this.initPromise;
      this.isInitialized = true;
      this.isHealthy = true;
    } catch (error) {
      // 如果初始化失败，重置Promise以便下次重试
      this.initPromise = null;
      this.isHealthy = false;
      throw error;
    }
  }

  // 健康检查方法
  private async healthCheck(): Promise<boolean> {
    if (!this.db || !this.isInitialized) {
      return false;
    }
    
    try {
      // 简单的读取测试
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
        
        // 添加数据库错误处理
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
      throw new Error('Database not initialized or unhealthy. Call init() first.');
    }
    return this.db;
  }

  // 安全的数据库操作包装器
  private async safeDBOperation<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try {
      // 健康检查
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

  // 创建带超时的Promise包装器
  private createTimeoutPromise<T>(
    promiseExecutor: (resolve: (value: T) => void, reject: (reason?: any) => void) => void,
    timeoutMs: number = 10000
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        reject(new Error(`IndexedDB operation timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // 包装原始的resolve和reject
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
      
      return this.createTimeoutPromise<RecordingSession[]>((resolve, reject) => {
        const transaction = db.transaction([SESSIONS_STORE], 'readonly');
        
        // 添加事务错误处理
        transaction.onerror = () => {
          console.error('Transaction error in getAllSessions:', transaction.error);
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
      });
    }, []);
  }

  async getSession(id: string): Promise<RecordingSession | null> {
    return this.safeDBOperation(async () => {
      await this.init();
      const db = this.ensureDB();
      
      return this.createTimeoutPromise<RecordingSession | null>((resolve, reject) => {
        const transaction = db.transaction([SESSIONS_STORE], 'readonly');
        
        transaction.onerror = () => {
          console.error('Transaction error in getSession:', transaction.error);
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
      });
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
      console.warn(`Session ${sessionId} not found, creating new session with updates`);
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

  // Migration helper - migrate from localStorage to IndexedDB
  async migrateFromLocalStorage(): Promise<void> {
    try {
      // 确保数据库已初始化但不触发递归
      if (!this.db || !this.isInitialized) {
        console.warn('Database not ready for migration, skipping...');
        return;
      }

      // Migrate sessions
      const sessionsKey = 'midscene-recording-sessions';
      const storedSessions = localStorage.getItem(sessionsKey);
      if (storedSessions) {
        const sessions: RecordingSession[] = JSON.parse(storedSessions);
        
        // 直接操作数据库而不通过方法调用，避免递归
        const db = this.db;
        const transaction = db.transaction([SESSIONS_STORE], 'readwrite');
        const store = transaction.objectStore(SESSIONS_STORE);
        
        // 批量添加sessions
        const promises = sessions.map(session => new Promise<void>((resolve, reject) => {
          const request = store.add(session);
          request.onsuccess = () => resolve();
          request.onerror = () => {
            // 如果session已存在，忽略错误
            if (request.error?.name === 'ConstraintError') {
              resolve();
            } else {
              reject(request.error);
            }
          };
        }));
        
        await Promise.all(promises);
        
        // Clean up localStorage after migration
        localStorage.removeItem(sessionsKey);
      }

      // Migrate current session ID
      const currentSessionIdKey = 'midscene-current-session-id';
      const currentSessionId = localStorage.getItem(currentSessionIdKey);
      if (currentSessionId) {
        await this.setCurrentSessionId(currentSessionId);
        localStorage.removeItem(currentSessionIdKey);
      }

      // Migrate recording state
      const recordingStateKey = 'midscene-recording-state';
      const recordingState = localStorage.getItem(recordingStateKey);
      if (recordingState) {
        await this.setRecordingState(recordingState === 'true');
        localStorage.removeItem(recordingStateKey);
      }
    } catch (error) {
      console.error('Failed to migrate from localStorage:', error);
    }
  }
}

// Singleton instance
export const dbManager = new IndexedDBManager();

// 全局初始化状态跟踪
let isGloballyInitialized = false;
let globalInitPromise: Promise<void> | null = null;

// Initialize the database
export const initializeDB = async (): Promise<void> => {
  // 防止重复初始化
  if (isGloballyInitialized) {
    return;
  }
  
  // 如果正在初始化，返回现有的Promise
  if (globalInitPromise) {
    return globalInitPromise;
  }

  globalInitPromise = (async () => {
    try {
      await dbManager.init();
      // 只在第一次初始化时执行迁移
      if (!isGloballyInitialized) {
        await dbManager.migrateFromLocalStorage();
        isGloballyInitialized = true;
      }
    } catch (error) {
      // 如果初始化失败，重置状态以便下次重试
      globalInitPromise = null;
      console.error('Failed to initialize IndexedDB:', error);
      throw error;
    }
  })();

  return globalInitPromise;
};
