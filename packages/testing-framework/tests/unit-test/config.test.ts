import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineMidsceneConfig } from '../../src/config';
import { defineRuntime } from '../../src/runtime';

describe('defineMidsceneConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a config-style uiAgent object', () => {
    const config = defineMidsceneConfig({
      uiAgent: { type: 'web', options: { url: 'https://x.test' } },
      testDir: './e2e',
    });
    expect(config.uiAgent).toMatchObject({ type: 'web' });
  });

  it('accepts a programmatic uiAgent factory', () => {
    const config = defineMidsceneConfig({
      uiAgent: async () => ({ agent: {} as never }),
      testDir: './e2e',
    });
    expect(typeof config.uiAgent).toBe('function');
  });

  it('warns but does not throw without uiAgent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const config =
      // @ts-expect-error intentionally missing
      defineMidsceneConfig({ testDir: './e2e' });
    expect(config.uiAgent).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Midscene]',
      expect.stringMatching(/uiAgent/),
    );
  });

  it('throws without testDir', () => {
    expect(() =>
      // @ts-expect-error intentionally missing
      defineMidsceneConfig({ uiAgent: { type: 'web' } }),
    ).toThrow(/testDir/);
  });
});

describe('defineRuntime', () => {
  it('returns the node function unchanged', () => {
    const node = defineRuntime(async () => ({ conclusion: 'done' }));
    expect(typeof node).toBe('function');
  });
});
