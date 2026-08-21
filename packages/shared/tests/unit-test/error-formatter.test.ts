import {
  getErrorMessage,
  getErrorStack,
  serializeError,
  truncateSerializedErrorString,
} from '@/agent-tools/error-formatter';
import { describe, expect, it } from '@rstest/core';

describe('getErrorMessage', () => {
  it('returns the Error.message for Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage(new TypeError('bad type'))).toBe('bad type');
    expect(getErrorMessage(new Error('Error without a message'))).toBe(
      'Error without a message',
    );
  });

  it('stringifies null and undefined', () => {
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('stringifies primitives', () => {
    expect(getErrorMessage('oops')).toBe('oops');
    expect(getErrorMessage(42)).toBe('42');
    expect(getErrorMessage(true)).toBe('true');
  });

  it('extracts message from { message } shape', () => {
    expect(getErrorMessage({ message: 'connect ECONNREFUSED' })).toBe(
      'connect ECONNREFUSED',
    );
  });

  it('extracts message from { error: { message } } shape', () => {
    expect(
      getErrorMessage({ error: { message: 'upstream failed', code: 502 } }),
    ).toBe('upstream failed');
  });

  it('extracts message from { cause: { message } } shape', () => {
    expect(getErrorMessage({ cause: { message: 'root cause' } })).toBe(
      'root cause',
    );
  });

  it('prefers top-level message over nested error/cause', () => {
    expect(
      getErrorMessage({
        message: 'outer',
        error: { message: 'inner' },
        cause: { message: 'root' },
      }),
    ).toBe('outer');
  });

  it('summarizes message-less objects from bounded diagnostic fields', () => {
    expect(getErrorMessage({ message: '', code: 'EIO' })).toBe(
      '{"name":"Error","message":"Error without a message","code":"EIO"}',
    );
    expect(getErrorMessage({ status: 500, details: 'x' })).toBe(
      '{"name":"Error","message":"Error without a message","status":500}',
    );
  });

  it('does not traverse circular objects while formatting a message', () => {
    const circular: Record<string, unknown> = { foo: 'bar' };
    circular.self = circular;
    expect(getErrorMessage(circular)).toBe(
      '{"name":"Error","message":"Error without a message"}',
    );
  });

  it('keeps whitelisted diagnostics without arbitrary object data', () => {
    const result = getErrorMessage({ code: 'E_TEST', detail: 'something' });
    expect(result).not.toBe('[object Object]');
    expect(result).toContain('E_TEST');
    expect(result).not.toContain('something');
  });

  it('does not serialize arbitrary array entries', () => {
    expect(getErrorMessage([1, 2, 3])).toBe(
      '{"name":"Error","message":"Error without a message"}',
    );
  });

  it('ignores message getters that throw', () => {
    const error = Object.defineProperty(
      { code: 'E_BROKEN_GETTER' },
      'message',
      {
        get: () => {
          throw new Error('getter failed');
        },
        enumerable: true,
      },
    );

    expect(getErrorMessage(error)).toBe(
      '{"name":"Error","message":"Error without a message","code":"E_BROKEN_GETTER"}',
    );
  });

  it('bounds long messages without serializing arbitrary payloads', () => {
    expect(getErrorMessage(new Error('x'.repeat(10_000)))).toHaveLength(4_096);

    const result = getErrorMessage({
      code: 'E_LARGE_PAYLOAD',
      payload: 'x'.repeat(10_000_000),
    });
    expect(result).toBe(
      '{"name":"Error","message":"Error without a message","code":"E_LARGE_PAYLOAD"}',
    );
    expect(result.length).toBeLessThan(1_000);
    expect(result).not.toContain('payload');
  });
});

describe('serializeError', () => {
  it('exposes the shared string bound for task summaries', () => {
    const serialized = truncateSerializedErrorString('x'.repeat(10_000));

    expect(serialized).toHaveLength(4_096);
    expect(serialized).toMatch(/… \[truncated\]$/);
  });

  it('preserves only the small normalized diagnostic whitelist', () => {
    const rootCause = Object.assign(new TypeError('socket closed'), {
      code: 'ECONNRESET',
      errno: -54,
      syscall: 'read',
    });
    const error = Object.assign(
      new Error('request failed', { cause: rootCause }),
      {
        code: 'UPSTREAM_UNAVAILABLE',
        statusCode: '503',
        requestID: 42,
        type: 'network',
        errno: -1,
        syscall: 'connect',
        hostname: 'private.example',
        payload: 'ignored',
      },
    );

    expect(serializeError(error)).toEqual({
      name: 'Error',
      message: 'request failed',
      stack: expect.stringContaining('Error: request failed'),
      code: 'UPSTREAM_UNAVAILABLE',
      status: '503',
      requestId: 42,
    });
  });

  it('extracts messages from structured SDK errors', () => {
    expect(
      serializeError({
        error: { message: 'upstream failed', response: { secret: true } },
        status: 502,
      }),
    ).toEqual({
      name: 'Error',
      message: 'upstream failed',
      status: 502,
    });

    expect(serializeError({ cause: { message: 'root cause' } })).toEqual({
      name: 'Error',
      message: 'root cause',
    });
  });

  it('does not traverse cause chains or circular payloads', () => {
    const circular = new Error('circular');
    circular.cause = circular;
    expect(serializeError(circular)).toEqual({
      name: 'Error',
      message: 'circular',
      stack: expect.stringContaining('Error: circular'),
    });

    const payload: Record<string, unknown> = { data: 'ignored' };
    payload.self = payload;
    expect(serializeError(payload)).toEqual({
      name: 'Error',
      message: 'Error without a message',
    });
  });

  it('does not fail when diagnostic getters throw', () => {
    const error = new Error('safe message');
    Object.defineProperty(error, 'code', {
      get: () => {
        throw new Error('code getter failed');
      },
    });

    expect(() => serializeError(error)).not.toThrow();
    const serialized = serializeError(error);
    expect(serialized).toMatchObject({
      name: 'Error',
      message: 'safe message',
    });
    expect(serialized).not.toHaveProperty('code');
  });

  it('omits arbitrary payloads from message-less thrown objects', () => {
    const serialized = serializeError({
      payload: 'x'.repeat(10_000_000),
    });

    expect(serialized).toEqual({
      name: 'Error',
      message: 'Error without a message',
    });
    expect(JSON.stringify(serialized).length).toBeLessThan(1_000);
  });

  it('provides a readable fallback for empty primitive strings', () => {
    expect(serializeError('')).toEqual({
      name: 'NonError',
      message: 'Empty string thrown',
    });
    expect(getErrorMessage('')).toBe('Empty string thrown');
  });

  it('caps every serialized string field', () => {
    const longText = 'x'.repeat(10_000);
    const error = Object.assign(new Error(longText, { cause: longText }), {
      stack: longText,
      code: longText,
    });

    const serialized = serializeError(error);
    expect(serialized.message).toHaveLength(4_096);
    expect(serialized.stack).toHaveLength(4_096);
    expect(serialized.code).toHaveLength(4_096);
    expect(serialized.message).toMatch(/… \[truncated\]$/);
    expect(JSON.stringify(serialized).length).toBeLessThan(15_000);
  });
});

describe('getErrorStack', () => {
  it('reads string stacks and ignores throwing stack getters', () => {
    expect(getErrorStack(new Error('boom'))).toContain('Error: boom');

    const error = Object.defineProperty({}, 'stack', {
      get: () => {
        throw new Error('stack getter failed');
      },
    });
    expect(getErrorStack(error)).toBeUndefined();
  });
});
