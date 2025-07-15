import type { InfoListItem } from '../components/playground';
import {
  IndexedDBManager,
  createCleanupFunction,
  withErrorHandling,
} from './baseDB';

// Database configuration
const DB_NAME = 'midscene_playground';
const DB_VERSION = 1;
const RESULTS_STORE = 'playground_results';
const MESSAGES_STORE = 'playground_messages';

// Playground storage utilities
const MAX_STORED_RESULTS = 50;

// Playground-specific interfaces
export interface IndexedDBPlaygroundResult {
  id: string;
  resultItem: InfoListItem;
  timestamp: number;
  size: number;
}

export interface IndexedDBPlaygroundMessage {
  id: string;
  data: InfoListItem;
  timestamp: number;
}

// Database manager instance
const playgroundDbManager = new IndexedDBManager(DB_NAME, DB_VERSION, [
  { name: RESULTS_STORE, keyPath: 'id' },
  { name: MESSAGES_STORE, keyPath: 'id' },
]);

// Cleanup function for old results
const cleanupOldResults = createCleanupFunction<IndexedDBPlaygroundResult>(
  playgroundDbManager,
  RESULTS_STORE,
  MAX_STORED_RESULTS,
);

// store result to IndexedDB
export const storeResult = async (
  resultId: string,
  resultItem: InfoListItem,
): Promise<void> => {
  await withErrorHandling(
    async () => {
      const serializedResult = JSON.stringify(resultItem);
      const data: IndexedDBPlaygroundResult = {
        id: resultId,
        resultItem,
        timestamp: Date.now(),
        size: new Blob([serializedResult]).size,
      };

      await playgroundDbManager.put(RESULTS_STORE, data);
      await cleanupOldResults();
    },
    'Failed to store result',
    undefined,
    cleanupOldResults,
  );
};

// get result from IndexedDB
export const getStoredResult = async (
  resultId: string,
): Promise<InfoListItem | null> => {
  return (
    (await withErrorHandling(
      async () => {
        const data = await playgroundDbManager.get<IndexedDBPlaygroundResult>(
          RESULTS_STORE,
          resultId,
        );
        if (!data) {
          console.warn('No stored data found for resultId:', resultId);
          return null;
        }
        return data.resultItem;
      },
      'Failed to get stored result',
      null,
    )) ?? null
  );
};

// clear all stored results
export const clearStoredResults = async (): Promise<void> => {
  await withErrorHandling(
    () => playgroundDbManager.clear(RESULTS_STORE),
    'Failed to clear stored results',
  );
};

// get messages from IndexedDB with default item fallback
export const getMsgsFromStorage = async <T>(defaultItem: T): Promise<T[]> => {
  return (
    (await withErrorHandling(
      async () => {
        const messages =
          await playgroundDbManager.getAll<IndexedDBPlaygroundMessage>(
            MESSAGES_STORE,
            true,
          );

        if (messages.length === 0) {
          return [];
        }

        // Restore messages with proper data handling
        const restoredMsgs = await Promise.all(
          messages.map(async (msg) => {
            const item = msg.data;
            const restoredItem = {
              ...defaultItem, // use default fields, then override
              ...item,
              timestamp: new Date(item.timestamp),
            };

            if (item.type === 'result') {
              const storedResultItem = await getStoredResult(item.id);
              if (storedResultItem) {
                restoredItem.result = storedResultItem.result;
                restoredItem.replayScriptsInfo =
                  storedResultItem.replayScriptsInfo;
                restoredItem.replayCounter = storedResultItem.replayCounter;
                restoredItem.verticalMode = storedResultItem.verticalMode;
              } else {
                restoredItem.result = {
                  result: undefined,
                  dump: null,
                  reportHTML: null,
                  error: null,
                };
              }
            }

            return restoredItem;
          }),
        );
        return restoredMsgs;
      },
      'Failed to get messages from IndexedDB',
      [],
    )) ?? []
  );
};

// store messages to IndexedDB
export const storeMsgsToStorage = async (
  infoList: InfoListItem[],
): Promise<void> => {
  await withErrorHandling(
    async () => {
      // Clear existing messages first
      await playgroundDbManager.clear(MESSAGES_STORE);

      // Filter and prepare messages
      const msgs = infoList
        .filter((item) => item.id !== 'welcome')
        .map((item) => {
          if (item.type === 'result') {
            return {
              ...item,
              result: undefined,
              replayScriptsInfo: undefined,
              replayCounter: undefined,
              verticalMode: undefined,
            };
          }
          return item;
        });

      // Store each message
      await Promise.all(
        msgs.map((msg, index) => {
          const data: IndexedDBPlaygroundMessage = {
            id: msg.id || `msg-${index}`,
            data: msg,
            timestamp: msg.timestamp
              ? msg.timestamp.getTime()
              : Date.now() + index,
          };
          return playgroundDbManager.put(MESSAGES_STORE, data);
        }),
      );
    },
    'Failed to store messages',
    undefined,
    cleanupOldResults,
  );
};

// clear stored messages
export const clearStoredMessages = async (): Promise<void> => {
  await withErrorHandling(
    () => playgroundDbManager.clear(MESSAGES_STORE),
    'Failed to clear messages from IndexedDB',
  );
  await clearStoredResults();
};

// get playground message count
export const getPlaygroundMessageCount = async (): Promise<number> => {
  return (
    (await withErrorHandling(
      () => playgroundDbManager.count(MESSAGES_STORE),
      'Failed to get playground message count',
      0,
    )) ?? 0
  );
};

// get playground result count
export const getPlaygroundResultCount = async (): Promise<number> => {
  return (
    (await withErrorHandling(
      () => playgroundDbManager.count(RESULTS_STORE),
      'Failed to get playground result count',
      0,
    )) ?? 0
  );
};

// Initialize database (for backward compatibility)
export const initDB = (): Promise<IDBDatabase> => {
  return playgroundDbManager.getDBPromise();
};
