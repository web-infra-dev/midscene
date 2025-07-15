// Generic database operations class
export class IndexedDBManager {
  private dbPromise: Promise<IDBDatabase>;
  private dbName: string;
  private version: number;
  private storeConfigs: Array<{ name: string; keyPath: string }>;

  constructor(
    dbName: string,
    version: number,
    storeConfigs: Array<{ name: string; keyPath: string }>,
  ) {
    this.dbName = dbName;
    this.version = version;
    this.storeConfigs = storeConfigs;
    this.dbPromise = this.initDB();
  }

  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create stores if they don't exist
        this.storeConfigs.forEach(({ name, keyPath }) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        });
      };
    });
  }

  private async withTransaction<T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    operation: (stores: IDBObjectStore | IDBObjectStore[]) => Promise<T>,
  ): Promise<T> {
    const db = await this.dbPromise;
    const transaction = db.transaction(storeNames, mode);

    const stores = Array.isArray(storeNames)
      ? storeNames.map((name) => transaction.objectStore(name))
      : transaction.objectStore(storeNames);

    return operation(stores);
  }

  private promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T>(storeName: string, data: T): Promise<void> {
    await this.withTransaction(storeName, 'readwrite', async (store) => {
      await this.promisifyRequest((store as IDBObjectStore).put(data));
    });
  }

  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    return this.withTransaction(storeName, 'readonly', async (store) => {
      return this.promisifyRequest((store as IDBObjectStore).get(key));
    });
  }

  async getAll<T>(storeName: string, sortByTimestamp = true): Promise<T[]> {
    return this.withTransaction(storeName, 'readonly', async (store) => {
      const objectStore = store as IDBObjectStore;
      const results = sortByTimestamp
        ? await this.promisifyRequest(objectStore.index('timestamp').getAll())
        : await this.promisifyRequest(objectStore.getAll());

      return sortByTimestamp
        ? results.sort((a: any, b: any) => a.timestamp - b.timestamp)
        : results;
    });
  }

  async clear(storeName: string): Promise<void> {
    await this.withTransaction(storeName, 'readwrite', async (store) => {
      await this.promisifyRequest((store as IDBObjectStore).clear());
    });
  }

  async delete(storeName: string, key: string): Promise<void> {
    await this.withTransaction(storeName, 'readwrite', async (store) => {
      await this.promisifyRequest((store as IDBObjectStore).delete(key));
    });
  }

  async count(storeName: string): Promise<number> {
    return this.withTransaction(storeName, 'readonly', async (store) => {
      return this.promisifyRequest((store as IDBObjectStore).count());
    });
  }

  getDBPromise(): Promise<IDBDatabase> {
    return this.dbPromise;
  }
}

// Generic error handler wrapper
export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  errorMessage: string,
  defaultValue?: T,
  onQuotaExceeded?: () => Promise<void>,
): Promise<T | undefined> => {
  try {
    return await operation();
  } catch (e) {
    console.error(errorMessage, e);
    if (
      e instanceof Error &&
      e.name === 'QuotaExceededError' &&
      onQuotaExceeded
    ) {
      console.log('Storage quota exceeded, running cleanup...');
      await onQuotaExceeded();
    }
    return defaultValue;
  }
};

// Base cleanup function for managing storage space
export const createCleanupFunction = <
  T extends { id: string; timestamp: number },
>(
  dbManager: IndexedDBManager,
  storeName: string,
  maxItems: number,
) => {
  return async (): Promise<void> => {
    try {
      const results = await dbManager.getAll<T>(storeName);

      if (results.length > maxItems) {
        const toDelete = results
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(0, results.length - maxItems);

        await Promise.all(
          toDelete.map((item) => dbManager.delete(storeName, item.id)),
        );
      }
    } catch (e) {
      console.error(`Failed to cleanup ${storeName}:`, e);
    }
  };
};
