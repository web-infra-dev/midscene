import { describe, expect, it } from 'vitest';
import { serializeRecorderEvent } from '../src/scripts/recorder-event-serialization';

describe('serializeRecorderEvent', () => {
  it('preserves semantic replay metadata', () => {
    const semantic = {
      source: 'recorderAI' as const,
      status: 'ready' as const,
      replayInstruction: 'Click the Submit button',
    };

    expect(
      serializeRecorderEvent({
        type: 'click',
        pageInfo: { width: 100, height: 100 },
        timestamp: 1,
        hashId: 'event-1',
        semantic,
      }),
    ).toMatchObject({ semantic });
  });
});
