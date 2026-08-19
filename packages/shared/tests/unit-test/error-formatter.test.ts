import {
  getErrorMessage,
  getErrorStack,
  serializeError,
} from '@/agent-tools/error-formatter';
import { describe, expect, it } from '@rstest/core';

describe('getErrorMessage', () => {
  it('returns the Error.message for Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage(new TypeError('bad type'))).toBe('bad type');
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

  it('skips empty string messages and falls through to JSON', () => {
    expect(getErrorMessage({ message: '', code: 'EIO' })).toBe(
      '{"message":"","code":"EIO"}',
    );
  });

  it('serializes plain objects without a known message field', () => {
    expect(getErrorMessage({ status: 500, details: 'x' })).toBe(
      '{"status":500,"details":"x"}',
    );
  });

  it('falls back to Object.prototype.toString for unserializable objects', () => {
    const circular: Record<string, unknown> = { foo: 'bar' };
    circular.self = circular;
    expect(getErrorMessage(circular)).toBe('[object Object]');
  });

  it('never returns the literal "[object Object]" for plain objects with data', () => {
    const result = getErrorMessage({ code: 'E_TEST', detail: 'something' });
    expect(result).not.toBe('[object Object]');
    expect(result).toContain('E_TEST');
  });

  it('handles arrays by JSON-stringifying them', () => {
    expect(getErrorMessage([1, 2, 3])).toBe('[1,2,3]');
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

    expect(getErrorMessage(error)).toBe('[object Object]');
  });
});

describe('serializeError', () => {
  it('preserves common diagnostics and nested causes', () => {
    const rootCause = Object.assign(new TypeError('socket closed'), {
      code: 'ECONNRESET',
      errno: -54,
      syscall: 'read',
    });
    const error = Object.assign(
      new Error('request failed', { cause: rootCause }),
      {
        statusCode: '503',
        requestId: 42,
      },
    );

    expect(serializeError(error)).toEqual({
      name: 'Error',
      message: 'request failed',
      stack: expect.stringContaining('Error: request failed'),
      statusCode: '503',
      requestId: 42,
      cause: {
        name: 'TypeError',
        message: 'socket closed',
        stack: expect.stringContaining('TypeError: socket closed'),
        code: 'ECONNRESET',
        errno: -54,
        syscall: 'read',
      },
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
      cause: {
        name: 'Error',
        message: 'root cause',
      },
    });
  });

  it('bounds cause depth and replaces cycles with a diagnostic marker', () => {
    const circular = new Error('circular');
    circular.cause = circular;
    expect(serializeError(circular).cause).toEqual({
      name: 'CircularError',
      message: 'Circular error cause',
    });

    const deepest = new Error('depth-3');
    const depthTwo = new Error('depth-2', { cause: deepest });
    const depthOne = new Error('depth-1', { cause: depthTwo });
    const outer = new Error('outer', { cause: depthOne });
    expect(serializeError(outer).cause?.cause?.message).toBe('depth-2');
    expect(serializeError(outer).cause?.cause?.cause).toBeUndefined();
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
    expect(serialized.cause?.message).toHaveLength(4_096);
    expect(serialized.message).toMatch(/… \[truncated\]$/);
    expect(JSON.stringify(serialized).length).toBeLessThan(20_000);
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
