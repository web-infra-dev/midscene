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
  return normalizeStoredSession(
    JSON.parse(JSON.stringify(session)) as StudioRecordingSession,
  );
}

function normalizeStoredSession(
  session: StudioRecordingSession,
): StudioRecordingSession {
  return {
    ...session,
    evidenceRevision:
      typeof session.evidenceRevision === 'number'
        ? session.evidenceRevision
        : 0,
    events: session.events.map((event) => ({
      ...event,
      actionTypeOrigin: event.actionTypeOrigin || 'fallback',
    })),
  };
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
    return memoryStore.sessions
      .map(normalizeStoredSession)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const sessions = await withStore<StudioRecordingSession[]>(
    SESSION_STORE,
    'readonly',
    (store) => store.getAll() as IDBRequest<StudioRecordingSession[]>,
  );
  return (sessions || [])
    .map(normalizeStoredSession)
    .sort((a, b) => b.updatedAt - a.updatedAt);
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

/**
 * Update an existing session inside one IndexedDB read/write transaction.
 * The updater must stay synchronous so the transaction cannot become inactive
 * between reading and writing the record.
 */
export async function updateStudioRecorderSessionAtomic(
  sessionId: string,
  updater: (current: StudioRecordingSession) => StudioRecordingSession,
): Promise<StudioRecordingSession> {
  if (typeof indexedDB === 'undefined') {
    const index = memoryStore.sessions.findIndex(
      (session) => session.id === sessionId,
    );
    if (index < 0) {
      throw new Error('Recorder session not found.');
    }
    const current = normalizeStoredSession(memoryStore.sessions[index]);
    const updated = sanitizeSession(updater(current));
    if (updated.id !== sessionId) {
      throw new Error('Recorder session updater cannot change the session id.');
    }
    memoryStore.sessions = [
      updated,
      ...memoryStore.sessions.filter((session) => session.id !== sessionId),
    ].slice(0, MAX_SESSIONS);
    return updated;
  }

  const db = await openDatabase();
  if (!db) {
    throw new Error('Recorder database is unavailable.');
  }

  return new Promise<StudioRecordingSession>((resolve, reject) => {
    const transaction = db.transaction(SESSION_STORE, 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);
    const request = store.get(sessionId) as IDBRequest<StudioRecordingSession>;
    let updatedSession: StudioRecordingSession | null = null;
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      db.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    request.onsuccess = () => {
      if (!request.result) {
        transaction.abort();
        fail(new Error('Recorder session not found.'));
        return;
      }
      try {
        const current = normalizeStoredSession(request.result);
        updatedSession = sanitizeSession(updater(current));
        if (updatedSession.id !== sessionId) {
          throw new Error(
            'Recorder session updater cannot change the session id.',
          );
        }
        store.put(updatedSession);
      } catch (error) {
        transaction.abort();
        fail(error);
      }
    };
    request.onerror = () => {
      fail(request.error || new Error('Failed to read recorder session.'));
    };
    transaction.oncomplete = () => {
      if (settled) {
        return;
      }
      settled = true;
      db.close();
      if (!updatedSession) {
        reject(new Error('Recorder session update produced no result.'));
        return;
      }
      resolve(updatedSession);
    };
    transaction.onerror = () => {
      fail(transaction.error || new Error('Recorder session update failed.'));
    };
    transaction.onabort = () => {
      if (!settled) {
        fail(
          transaction.error || new Error('Recorder session update aborted.'),
        );
      }
    };
  });
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
