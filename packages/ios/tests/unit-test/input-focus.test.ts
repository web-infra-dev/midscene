import { WebDriverRequestError } from '@midscene/webdriver';
import { describe, expect, it, rs } from '@rstest/core';
import { type InputRequest, clearInputWithFocus } from '../../src/input-focus';

const protocolError = (code: string) =>
  new WebDriverRequestError(code, 404, { value: { error: code } });

function fixture(
  options: {
    blur?: boolean;
    stale?: boolean;
    clearError?: Error;
    clickError?: Error;
    remainingText?: string | null;
    inputType?: string;
    placeholder?: string;
    clearFailsOnce?: boolean;
    initialMatches?: string[];
    finalMatches?: string[];
    recoverFocus?: boolean;
  } = {},
) {
  let cleared = false;
  let clearCount = 0;
  let active: string | undefined = 'original';
  const request = rs.fn<InputRequest>(async (method, path) => {
    if (path === '/element/active') {
      if (!active) throw protocolError('no such element');
      return { value: { ELEMENT: active } };
    }
    if (path.endsWith('/attribute/name')) return { value: 'message-input' };
    if (path.endsWith('/attribute/type'))
      return { value: options.inputType ?? 'XCUIElementTypeTextView' };
    if (path.endsWith('/attribute/placeholderValue'))
      return { value: options.placeholder ?? null };
    if (path.endsWith('/attribute/value'))
      return {
        value: options.remainingText === undefined ? '' : options.remainingText,
      };
    if (path === '/elements')
      return {
        value: (cleared
          ? (options.finalMatches ?? ['replacement'])
          : (options.initialMatches ?? ['original'])
        ).map((ELEMENT) => ({ ELEMENT })),
      };
    if (path.endsWith('/clear')) {
      cleared = true;
      if (options.blur) active = undefined;
      clearCount++;
      if (options.clearError && (!options.clearFailsOnce || clearCount === 1))
        throw options.clearError;
      return { value: null };
    }
    if (path.endsWith('/click')) {
      if (options.clickError) throw options.clickError;
      if (options.stale && path.includes('/original/'))
        throw protocolError('stale element reference');
      if (options.recoverFocus !== false)
        active = path.includes('/original/') ? 'original' : 'replacement';
      return { value: null };
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  });
  return request;
}

describe('clearInputWithFocus', () => {
  it('does not click when clearing preserves focus', async () => {
    const request = fixture();
    expect(await clearInputWithFocus(request)).toBe(true);
    expect(request.mock.calls.some(([, path]) => path.endsWith('/click'))).toBe(
      false,
    );
  });
  it('restores focus using the original element', async () => {
    const request = fixture({ blur: true });
    expect(await clearInputWithFocus(request)).toBe(true);
    expect(request).toHaveBeenCalledWith('POST', '/element/original/click');
  });
  it('reacquires a stale input and verifies a clear that failed after mutation', async () => {
    const request = fixture({
      blur: true,
      stale: true,
      clearError: protocolError('stale element reference'),
    });
    expect(await clearInputWithFocus(request)).toBe(true);
    expect(request).toHaveBeenCalledWith('POST', '/element/replacement/click');
    expect(request).toHaveBeenCalledWith(
      'GET',
      '/element/replacement/attribute/value',
    );
  });
  it('accepts WDA null for an empty field after stale clear', async () => {
    expect(
      await clearInputWithFocus(
        fixture({
          blur: true,
          stale: true,
          clearError: protocolError('stale element reference'),
          remainingText: null,
        }),
      ),
    ).toBe(true);
  });
  it('uses an identifier and input type predicate instead of label matching', async () => {
    const request = fixture({ blur: true, stale: true });
    await clearInputWithFocus(request);
    expect(request).toHaveBeenCalledWith('POST', '/elements', {
      using: 'predicate string',
      value:
        'name == "message-input" AND name != label AND type == "XCUIElementTypeTextView"',
    });
  });
  it('does not reacquire a non-input element', async () => {
    const request = fixture({
      blur: true,
      stale: true,
      inputType: 'XCUIElementTypeButton',
    });
    await expect(clearInputWithFocus(request)).rejects.toThrow(
      'stale element reference',
    );
    expect(
      request.mock.calls.some(
        ([, path]) => path === '/element/replacement/click',
      ),
    ).toBe(false);
  });
  it('retries clear once rather than trusting text equal to the placeholder', async () => {
    const request = fixture({
      blur: true,
      stale: true,
      clearError: protocolError('stale element reference'),
      clearFailsOnce: true,
      remainingText: 'Message',
      placeholder: 'Message',
    });
    expect(await clearInputWithFocus(request)).toBe(true);
    expect(
      request.mock.calls.filter(([, path]) => path.endsWith('/clear')),
    ).toHaveLength(2);
  });
  it('bounds retries when placeholder content remains ambiguous', async () => {
    const request = fixture({
      blur: true,
      clearError: protocolError('stale element reference'),
      remainingText: 'Message',
      placeholder: 'Message',
    });
    await expect(clearInputWithFocus(request)).rejects.toThrow(
      'refusing to append text',
    );
    expect(
      request.mock.calls.filter(([, path]) => path.endsWith('/clear')),
    ).toHaveLength(2);
  });
  it('rejects an unverified clear instead of appending to old text', async () => {
    const request = fixture({
      blur: true,
      clearError: protocolError('stale element reference'),
      remainingText: 'old text',
    });
    await expect(clearInputWithFocus(request)).rejects.toThrow(
      'refusing to append text',
    );
  });
  it('propagates clear transport errors without recovery', async () => {
    const request = fixture({ clearError: new Error('network failed') });
    await expect(clearInputWithFocus(request)).rejects.toThrow(
      'network failed',
    );
    expect(request.mock.calls.some(([, path]) => path.endsWith('/click'))).toBe(
      false,
    );
  });
  it('does not reinterpret click transport errors as stale elements', async () => {
    const request = fixture({
      blur: true,
      clickError: new Error('network failed'),
    });
    await expect(clearInputWithFocus(request)).rejects.toThrow(
      'network failed',
    );
    expect(
      request.mock.calls.filter(([, path]) => path === '/elements'),
    ).toHaveLength(1);
  });
  it.each([[], ['original', 'other'], ['other']].map((matches) => [matches]))(
    'does not trust a locator that was not unique to the original input: %j',
    async (initialMatches) => {
      await expect(
        clearInputWithFocus(
          fixture({ blur: true, stale: true, initialMatches }),
        ),
      ).rejects.toThrow('stale element reference');
    },
  );
  it.each([[], ['replacement', 'other']].map((matches) => [matches]))(
    'rejects a missing or ambiguous replacement: %j',
    async (finalMatches) => {
      await expect(
        clearInputWithFocus(fixture({ blur: true, stale: true, finalMatches })),
      ).rejects.toThrow('Cannot uniquely identify');
    },
  );
  it('fails when clicking does not restore focus', async () => {
    await expect(
      clearInputWithFocus(fixture({ blur: true, recoverFocus: false })),
    ).rejects.toThrow('Failed to restore input focus');
  });
  it.each(['no such element', 'unknown command', 'unsupported operation'])(
    'preserves unavailable initial discovery: %s',
    async (code) => {
      const request = rs
        .fn<InputRequest>()
        .mockRejectedValue(protocolError(code));
      expect(await clearInputWithFocus(request)).toBe(false);
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it('propagates session failure during initial discovery', async () => {
    await expect(
      clearInputWithFocus(
        rs
          .fn<InputRequest>()
          .mockRejectedValue(protocolError('invalid session id')),
      ),
    ).rejects.toThrow('invalid session id');
  });
});
