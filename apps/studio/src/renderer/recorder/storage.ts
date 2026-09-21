import type { StudioRecordingSession } from './types';

const DB_NAME = 'midscene-studio-recorder';
const DB_VERSION = 2;
const SESSION_STORE = 'sessions';
const CONFIG_STORE = 'config';
const CURRENT_SESSION_KEY = 'currentSessionId';
const RECORDER_STORAGE_FORMAT_KEY = 'recorderStorageFormat';
const RECORDER_STORAGE_FORMAT_VERSION = 'asset-backed-v1';
const MAX_SESSIONS = 20;

interface StudioRecorderConfigRecord {
  key: string;
  value: string | null;
}

const memoryStore = {
  sessions: [] as StudioRecordingSession[],
  currentSessionId: null as string | null,
};

function sanitizeSession(
  session: StudioRecordingSession,
): StudioRecordingSession {
  return JSON.parse(JSON.stringify(session)) as StudioRecordingSession;
}

function migrateLegacyRecorderSessions(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [SESSION_STORE, CONFIG_STORE],
      'readwrite',
    );
    const sessions = transaction.objectStore(SESSION_STORE);
    const config = transaction.objectStore(CONFIG_STORE);
    const migration = config.get(
      RECORDER_STORAGE_FORMAT_KEY,
    ) as IDBRequest<StudioRecorderConfigRecord>;
    let shouldClearSessions = false;

    migration.onsuccess = () => {
      shouldClearSessions =
        migration.result?.value !== RECORDER_STORAGE_FORMAT_VERSION;
      if (shouldClearSessions) {
        sessions.clear();
        config.put({
          key: RECORDER_STORAGE_FORMAT_KEY,
          value: RECORDER_STORAGE_FORMAT_VERSION,
        } satisfies StudioRecorderConfigRecord);
      }
    };
    migration.onerror = () => {
      reject(migration.error || new Error('Failed to read recorder migration'));
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('Failed to migrate recorder data'));
  });
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion > 0 && event.oldVersion < 2) {
        if (db.objectStoreNames.contains(SESSION_STORE)) {
          db.deleteObjectStore(SESSION_STORE);
        }
        if (db.objectStoreNames.contains(CONFIG_STORE)) {
          db.deleteObjectStore(CONFIG_STORE);
        }
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CONFIG_STORE)) {
        db.createObjectStore(CONFIG_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      void migrateLegacyRecorderSessions(db)
        .then(() => resolve(db))
        .catch((error) => {
          db.close();
          reject(error);
        });
    };
    request.onerror = () => {
      reject(request.error || new Error('Failed to open recorder database'));
    };
  });
}

function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | undefined,
): Promise<T | undefined> {
  return openDatabase().then((db) => {
    if (!db) {
      return undefined;
    }

    return new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = callback(store);
      let result: T | undefined;

      if (request) {
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => {
          reject(
            request.error || new Error('Recorder database request failed'),
          );
        };
      }

      transaction.oncomplete = () => {
        db.close();
        resolve(result);
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Recorder database failed'));
      };
    });
  });
}

async function trimSessions(): Promise<string[]> {
  const sessions = await getStudioRecorderSessions();
  if (sessions.length <= MAX_SESSIONS) {
    return [];
  }
  const expired = sessions.slice(MAX_SESSIONS);
  await Promise.all(
    expired.map((session) => deleteStudioRecorderSession(session.id)),
  );
  return expired.map((session) => session.id);
}

export async function getStudioRecorderSessions(): Promise<
  StudioRecordingSession[]
> {
  if (typeof indexedDB === 'undefined') {
    return [...memoryStore.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const sessions = await withStore<StudioRecordingSession[]>(
    SESSION_STORE,
    'readonly',
    (store) => store.getAll() as IDBRequest<StudioRecordingSession[]>,
  );
  return [...(sessions || [])].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function upsertStudioRecorderSession(
  session: StudioRecordingSession,
): Promise<string[]> {
  const safeSession = sanitizeSession(session);
  if (typeof indexedDB === 'undefined') {
    const sessions = [
      safeSession,
      ...memoryStore.sessions.filter((item) => item.id !== safeSession.id),
    ].sort((a, b) => b.updatedAt - a.updatedAt);
    const expired = sessions.slice(MAX_SESSIONS);
    memoryStore.sessions = sessions.slice(0, MAX_SESSIONS);
    return expired.map((item) => item.id);
  }

  await withStore(SESSION_STORE, 'readwrite', (store) =>
    store.put(safeSession),
  );
  return trimSessions();
}

export async function deleteStudioRecorderSession(
  sessionId: string,
): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    memoryStore.sessions = memoryStore.sessions.filter(
      (session) => session.id !== sessionId,
    );
    if (memoryStore.currentSessionId === sessionId) {
      memoryStore.currentSessionId = null;
    }
    return;
  }

  await withStore(SESSION_STORE, 'readwrite', (store) =>
    store.delete(sessionId),
  );
}

export async function getCurrentStudioRecorderSessionId(): Promise<
  string | null
> {
  if (typeof indexedDB === 'undefined') {
    return memoryStore.currentSessionId;
  }

  const record = await withStore<StudioRecorderConfigRecord>(
    CONFIG_STORE,
    'readonly',
    (store) =>
      store.get(CURRENT_SESSION_KEY) as IDBRequest<StudioRecorderConfigRecord>,
  );
  return record?.value ?? null;
}

export async function setCurrentStudioRecorderSessionId(
  sessionId: string | null,
): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    memoryStore.currentSessionId = sessionId;
    return;
  }

  await withStore(CONFIG_STORE, 'readwrite', (store) =>
    store.put({
      key: CURRENT_SESSION_KEY,
      value: sessionId,
    } satisfies StudioRecorderConfigRecord),
  );
}
