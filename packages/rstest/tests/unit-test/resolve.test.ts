import { describe, expect, it } from '@rstest/core';
import { applyResolver } from '../../src/resolve';

describe('applyResolver', () => {
  it('returns base when input is undefined', async () => {
    const base = { a: 1, b: 2 };
    expect(await applyResolver(undefined, base)).toEqual(base);
  });

  it('deep-merges object input over base', async () => {
    const base = { a: 1, b: 2, c: 3 };
    expect(await applyResolver({ b: 20 }, base)).toEqual({ a: 1, b: 20, c: 3 });
  });

  it('preserves sibling fields in nested objects', async () => {
    const base = { viewport: { width: 1920, height: 1080 } };
    expect(
      await applyResolver(
        { viewport: { width: 1440 } } as Partial<typeof base>,
        base,
      ),
    ).toEqual({ viewport: { width: 1440, height: 1080 } });
  });

  it('concatenates arrays instead of replacing them', async () => {
    const base = {
      args: ['--no-sandbox', '--ignore-certificate-errors'] as string[],
    };
    expect(await applyResolver({ args: ['--start-fullscreen'] }, base)).toEqual(
      {
        args: [
          '--no-sandbox',
          '--ignore-certificate-errors',
          '--start-fullscreen',
        ],
      },
    );
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

  it('applies an array of overrides left-to-right', async () => {
    const base = { a: 1, b: 2, args: ['x'] as string[] };
    const result = await applyResolver(
      [{ a: 10 }, (d) => ({ ...d, b: d.b + 100 }), { args: ['y'] }],
      base,
    );
    expect(result).toEqual({ a: 10, b: 102, args: ['x', 'y'] });
  });
});
