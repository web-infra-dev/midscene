import { describe, expect, it } from '@rstest/core';
import { applyResolver } from '../../src/resolve';

describe('applyResolver', () => {
  it('returns base when input is undefined', async () => {
    const base = { a: 1, b: 2 };
    expect(await applyResolver(undefined, base)).toEqual(base);
  });

  it('shallow-merges object input over base', async () => {
    const base = { a: 1, b: 2, c: 3 };
    expect(await applyResolver({ b: 20 }, base)).toEqual({ a: 1, b: 20, c: 3 });
  });

  it('replaces nested values entirely (no deep merge)', async () => {
    const base = { args: ['--no-sandbox'], proxy: { server: 'a' } };
    expect(
      await applyResolver(
        { proxy: { server: 'b' } } as { proxy: { server: string } },
        base,
      ),
    ).toEqual({ args: ['--no-sandbox'], proxy: { server: 'b' } });
  });

  it('calls function with resolved defaults and returns its result', async () => {
    const base = { headless: false, args: ['--no-sandbox'] as string[] };
    const result = await applyResolver(
      (defaults) => ({
        ...defaults,
        args: [...defaults.args, '--disable-gpu'],
      }),
      base,
    );
    expect(result).toEqual({
      headless: false,
      args: ['--no-sandbox', '--disable-gpu'],
    });
  });

  it('awaits async resolver functions', async () => {
    const base = { a: 1 };
    const result = await applyResolver(
      async (defaults) => ({ ...defaults, a: defaults.a + 10 }),
      base,
    );
    expect(result).toEqual({ a: 11 });
  });

  it('lets the function fully replace defaults', async () => {
    const base = { a: 1, b: 2 };
    const result = await applyResolver(() => ({ a: 99, b: 99 }), base);
    expect(result).toEqual({ a: 99, b: 99 });
  });
});
