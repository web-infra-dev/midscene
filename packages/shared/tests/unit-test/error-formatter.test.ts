import { getErrorMessage } from '@/mcp/error-formatter';
import { describe, expect, it } from 'vitest';

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
});
