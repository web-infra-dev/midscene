import { describe, expect, test } from 'vitest';

import { resolveAiActionContext } from '@/puppeteer/agent-launcher';
import type { MidsceneYamlScriptWebEnv } from '@midscene/core';

const baseTarget: Pick<MidsceneYamlScriptWebEnv, 'url'> = {
  url: 'http://example.com',
};

describe('resolveAiActionContext', () => {
  test('prefers preference aiActContext when both preference values are provided', () => {
    const target = {
      ...baseTarget,
      aiActionContext: 'from-target',
    } as MidsceneYamlScriptWebEnv;

    const result = resolveAiActionContext(target, {
      aiActContext: 'from-preference-new',
      aiActionContext: 'from-preference-deprecated',
    });

    expect(result).toBe('from-preference-new');
  });

  test('uses preference aiActionContext (deprecated) when aiActContext is undefined', () => {
    const target = {
      ...baseTarget,
      aiActionContext: 'from-target',
    } as MidsceneYamlScriptWebEnv;

    const result = resolveAiActionContext(target, {
      aiActionContext: 'from-preference-deprecated',
    });

    expect(result).toBe('from-preference-deprecated');
  });

  test('falls back to target when preference is undefined', () => {
    const target = {
      ...baseTarget,
      aiActionContext: 'from-target',
    } as MidsceneYamlScriptWebEnv;

    const result = resolveAiActionContext(target, {
      aiActionContext: undefined,
      aiActContext: undefined,
    });

    expect(result).toBe('from-target');
  });

  test('prefers preference over target when both are provided', () => {
    const target = {
      ...baseTarget,
      aiActionContext: 'from-target',
    } as MidsceneYamlScriptWebEnv;

    const result = resolveAiActionContext(target, {
      aiActContext: 'from-preference',
    });

    expect(result).toBe('from-preference');
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
