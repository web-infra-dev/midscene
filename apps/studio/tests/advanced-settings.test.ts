import { describe, expect, it } from 'vitest';
import {
  normalizeStudioRuntimeSettings,
  resolveStudioAgentOptions,
  serializeStudioRuntimeSettings,
} from '../src/shared/advanced-settings';

describe('Studio advanced settings contract', () => {
  it('normalizes empty input to the versioned settings shape', () => {
    expect(normalizeStudioRuntimeSettings(undefined)).toEqual({
      schemaVersion: 1,
      agentOptions: {},
    });
  });

  it('accepts the same boundaries as the shared agent option schemas', () => {
    const settings = normalizeStudioRuntimeSettings({
      schemaVersion: 1,
      agentOptions: {
        aiActContext: '',
        replanningCycleLimit: 0,
        screenshotShrinkFactor: 21.5,
        waitAfterAction: 0.5,
      },
    });

    expect(settings.agentOptions).toEqual({
      aiActContext: '',
      replanningCycleLimit: 0,
      screenshotShrinkFactor: 21.5,
      waitAfterAction: 0.5,
    });
  });

  it.each([
    [{ agentOptions: { unknownOption: true } }, 'unknown key'],
    [{ agentOptions: { replanningCycleLimit: -1 } }, 'greater than or equal'],
    [{ agentOptions: { replanningCycleLimit: 1.5 } }, 'integer'],
    [
      { agentOptions: { screenshotShrinkFactor: 0.5 } },
      'greater than or equal',
    ],
    [{ agentOptions: { waitAfterAction: -0.1 } }, 'greater than or equal'],
    [
      { agentOptions: { waitAfterAction: Number.POSITIVE_INFINITY } },
      'JSON-serializable',
    ],
  ])('rejects invalid settings %#', (input, expectedMessage) => {
    expect(() => normalizeStudioRuntimeSettings(input)).toThrow(
      expectedMessage,
    );
  });

  it('returns immutable-by-copy runtime values and stable serialization', () => {
    const settings = normalizeStudioRuntimeSettings({
      agentOptions: { waitAfterAction: 250 },
    });
    const resolved = resolveStudioAgentOptions(settings);

    resolved.waitAfterAction = 500;

    expect(settings.agentOptions.waitAfterAction).toBe(250);
    expect(serializeStudioRuntimeSettings(settings)).toBe(
      '{"schemaVersion":1,"agentOptions":{"waitAfterAction":250}}',
    );
  });
});
