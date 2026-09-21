import { describe, expect, it } from 'vitest';
import {
  getStudioRecorderSessions,
  upsertStudioRecorderSession,
} from '../src/renderer/recorder/storage';
import type { StudioRecordingSession } from '../src/renderer/recorder/types';

function createSession(index: number): StudioRecordingSession {
  return {
    id: `session-${index}`,
    name: `Session ${index}`,
    status: 'completed',
    target: {
      platformId: 'web',
      label: 'Web',
      values: { url: 'https://example.com' },
    },
    events: [],
    createdAt: index,
    updatedAt: index,
  };
}

describe('studio recorder storage', () => {
  it('returns sessions evicted by the retention limit', async () => {
    let evictedSessionIds: string[] = [];
    for (let index = 0; index <= 20; index += 1) {
      evictedSessionIds = await upsertStudioRecorderSession(
        createSession(index),
      );
    }

    expect(evictedSessionIds).toEqual(['session-0']);
    expect(await getStudioRecorderSessions()).toHaveLength(20);
  });
});
