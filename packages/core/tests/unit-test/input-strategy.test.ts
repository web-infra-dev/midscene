import {
  type InputStrategy,
  resolveInputStrategy,
  resolveTextInputOptions,
  sendTextSequentially,
  shouldInputSequentially,
} from '@/device';
import { describe, expect, it, vi } from 'vitest';

describe('text input strategy', () => {
  it('defaults to legacy', () => {
    expect(resolveInputStrategy(undefined)).toBe('legacy');
  });

  it('rejects an unsupported runtime strategy', () => {
    expect(() => resolveInputStrategy('paste' as InputStrategy)).toThrow(
      'inputStrategy must be one of: legacy, sequential, bulk; received paste',
    );
    expect(() =>
      resolveInputStrategy(null as unknown as InputStrategy),
    ).toThrow(
      'inputStrategy must be one of: legacy, sequential, bulk; received null',
    );
  });

  it('rejects bulk input with a positive keyboard delay', () => {
    expect(() => resolveInputStrategy('bulk', 1)).toThrow(
      'inputStrategy "bulk" requires keyboardTypeDelay to be omitted or set to 0; use inputStrategy "sequential" for delayed input',
    );
  });

  it('allows bulk input with zero delay', () => {
    expect(resolveInputStrategy('bulk', 0)).toBe('bulk');
  });

  it.each([-1, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY])(
    'rejects invalid keyboard delay %s',
    (keyboardTypeDelay) => {
      expect(() => resolveInputStrategy('legacy', keyboardTypeDelay)).toThrow(
        'keyboardTypeDelay must be a finite non-negative number',
      );
    },
  );

  it('resolves action options over platform defaults', () => {
    expect(
      resolveTextInputOptions(
        { inputStrategy: 'bulk', keyboardTypeDelay: 0 },
        { inputStrategy: 'sequential', keyboardTypeDelay: 80 },
      ),
    ).toEqual({ inputStrategy: 'bulk', keyboardTypeDelay: 0 });
  });

  it('preserves platform defaults when action options are omitted', () => {
    expect(
      resolveTextInputOptions(undefined, {
        inputStrategy: 'sequential',
        keyboardTypeDelay: 0,
      }),
    ).toEqual({ inputStrategy: 'sequential', keyboardTypeDelay: 0 });
  });

  it('identifies legacy delayed and explicit sequential input', () => {
    expect(
      shouldInputSequentially({
        inputStrategy: 'legacy',
        keyboardTypeDelay: 1,
      }),
    ).toBe(true);
    expect(
      shouldInputSequentially({
        inputStrategy: 'sequential',
        keyboardTypeDelay: 0,
      }),
    ).toBe(true);
    expect(
      shouldInputSequentially({
        inputStrategy: 'legacy',
        keyboardTypeDelay: 0,
      }),
    ).toBe(false);
  });

  it('sends Unicode code points in order and waits only between them', async () => {
    const sendCharacter = vi.fn();
    const wait = vi.fn();

    await sendTextSequentially(
      'A😀B',
      { sendCharacter, wait },
      { delayMs: 25 },
    );

    expect(sendCharacter.mock.calls).toEqual([['A'], ['😀'], ['B']]);
    expect(wait.mock.calls).toEqual([[25], [25]]);
  });

  it('can preserve a legacy trailing delay explicitly', async () => {
    const wait = vi.fn();

    await sendTextSequentially(
      'AB',
      { sendCharacter: vi.fn(), wait },
      { delayMs: 10, delayAfterLast: true },
    );

    expect(wait).toHaveBeenCalledTimes(2);
  });
});
