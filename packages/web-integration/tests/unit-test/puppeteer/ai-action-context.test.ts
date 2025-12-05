import { describe, expect, test } from 'vitest';

import { resolveAiActionContext } from '@/puppeteer/agent-launcher';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';

const baseTarget: Pick<MidsceneYamlScriptWebEnv, 'url'> = {
  url: 'http://example.com',
};

describe('resolveAiActionContext', () => {
  test('prefers target aiActionContext when both are provided', () => {
    const target = {
      ...baseTarget,
      aiActionContext: 'from-target',
    } as MidsceneYamlScriptWebEnv;

    const result = resolveAiActionContext(target, {
      aiActionContext: 'from-agent',
    });

    expect(result).toBe('from-target');
  });

  test('falls back to agent preference when target is undefined', () => {
    const target = {
      ...baseTarget,
      aiActionContext: undefined,
    } as MidsceneYamlScriptWebEnv;

    const result = resolveAiActionContext(target, {
      aiActionContext: 'from-agent',
    });

    expect(result).toBe('from-agent');
  });

  test('returns undefined when neither target nor preference provides context', () => {
    const target = {
      ...baseTarget,
      aiActionContext: undefined,
    } as MidsceneYamlScriptWebEnv;

    const result = resolveAiActionContext(target);

    expect(result).toBeUndefined();
  });
});
