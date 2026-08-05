import { createModelInteractionContext } from '@/ai-model/model-interaction-context';
import { describe, expect, it } from 'vitest';

describe('model record context', () => {
  it('creates a UUID interaction ID', () => {
    const context = createModelInteractionContext();

    expect(context.interactionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('creates a distinct ID for each top-level operation', () => {
    const first = createModelInteractionContext();
    const second = createModelInteractionContext();

    expect(first.interactionId).not.toBe(second.interactionId);
  });

  it('prefixes a fallback interaction ID', () => {
    const context = createModelInteractionContext({ fallback: true });

    expect(context.interactionId).toMatch(
      /^fallback-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
