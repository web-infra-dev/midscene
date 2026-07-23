import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { startNewRecording } from '../src/extension/recorder/startNewRecording';
import type { RecordingSession } from '../src/store';
import { toRecordingSessionMetadata } from '../src/utils/indexedDB';

const session: RecordingSession = {
  id: 'session-1',
  name: 'Session 1',
  createdAt: 1,
  updatedAt: 2,
  events: [{ type: 'screenshot', screenshot: 'large-image-data' }] as never[],
  status: 'idle',
};

describe('Recorder session persistence', () => {
  it('starts recording only after the new session has persisted', async () => {
    let finishPersistence: ((value: RecordingSession) => void) | undefined;
    const createNewSession = vi.fn(
      () =>
        new Promise<RecordingSession>((resolve) => {
          finishPersistence = resolve;
        }),
    );
    const startRecording = vi.fn(async () => undefined);

    const operation = startNewRecording(createNewSession, startRecording);
    expect(startRecording).not.toHaveBeenCalled();

    finishPersistence?.(session);
    await operation;

    expect(startRecording).toHaveBeenCalledOnce();
    expect(startRecording).toHaveBeenCalledWith(session.id);
  });

  it('stores list metadata without cloning recorded events', () => {
    const metadata = toRecordingSessionMetadata(session);

    expect(metadata).not.toHaveProperty('events');
    expect(metadata.eventCount).toBe(1);
    expect(metadata.id).toBe(session.id);
    expect(metadata.name).toBe(session.name);
  });

  it('preserves event counts when refreshing metadata from a summary', () => {
    const metadata = toRecordingSessionMetadata({
      ...session,
      events: [],
      eventCount: 7,
    });

    expect(metadata.eventCount).toBe(7);
  });

  it('opens the existing IndexedDB version without forcing an upgrade', async () => {
    const source = await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../src/utils/indexedDB.ts',
      ),
      'utf8',
    );

    expect(source).toContain('indexedDB.open(DB_NAME)');
    expect(source).not.toMatch(/indexedDB\.open\(DB_NAME,\s*[^)]/);
    expect(source).not.toContain('const DB_VERSION');
  });

  it('propagates failed session deletes so optimistic UI state can roll back', async () => {
    const source = await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../src/utils/indexedDB.ts',
      ),
      'utf8',
    );
    const deleteSession = source.slice(
      source.indexOf('async deleteSession('),
      source.indexOf('// Config management'),
    );

    expect(deleteSession).not.toContain('catch (error)');
    expect(deleteSession).toContain('transaction.onerror = () => reject');
  });

  it('renders session metadata before recording events finish restoring', async () => {
    const source = await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../src/extension/recorder/index.tsx',
      ),
      'utf8',
    );

    const startRecordingStore = source.indexOf(
      'const recordStoreInitialization = recordStore.initialize()',
    );
    const waitForSessions = source.indexOf(
      'await sessionStore.initializeStore()',
    );
    const showSessionList = source.indexOf('setIsStoreInitialized(true)');
    const waitForRecordingStore = source.indexOf(
      'await recordStoreInitialization',
    );

    expect(startRecordingStore).toBeGreaterThan(-1);
    expect(waitForSessions).toBeGreaterThan(startRecordingStore);
    expect(showSessionList).toBeGreaterThan(waitForSessions);
    expect(waitForRecordingStore).toBeGreaterThan(showSessionList);
    expect(source).not.toContain(
      'Promise.all([sessionStore.initializeStore(), recordStore.initialize()])',
    );
  });
});
