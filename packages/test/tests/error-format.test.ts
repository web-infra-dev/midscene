import { describe, expect, it } from 'vitest';
import { formatCliError } from '../src/cli/error-format';

describe('CLI error diagnostics', () => {
  it('preserves stacks and nested causes even when toJSON omits them', () => {
    const original = new Error('original dependency failure');
    original.stack =
      'Error: original dependency failure\n    at original.js:1:2';
    const cause = new Error('dependency failed', { cause: original });
    cause.stack = 'Error: dependency failed\n    at dependency.js:3:69';
    const error = new Error('config failed', { cause });
    error.stack = 'Error: config failed\n    at config.ts:12:5';
    Object.assign(error, { toJSON: () => ({ message: error.message }) });

    const output = formatCliError(error);

    expect(output).toContain(error.stack);
    for (const stack of [cause.stack, original.stack]) {
      for (const line of stack.split('\n')) {
        expect(output).toContain(line.trim());
      }
    }
  });

  it('preserves aggregate failures', () => {
    const first = new Error('first cleanup failed');
    first.stack = 'Error: first cleanup failed\n    at first-cleanup.ts:3:5';
    const second = new Error('second cleanup failed');
    second.stack = 'Error: second cleanup failed\n    at second-cleanup.ts:7:9';
    const output = formatCliError(
      new AggregateError([first, second], 'cleanup failed'),
    );

    for (const stack of [first.stack, second.stack]) {
      for (const line of stack.split('\n')) {
        expect(output).toContain(line.trim());
      }
    }
  });

  it('still reports an Error without a stack', () => {
    const error = new Error('stack unavailable');
    error.stack = undefined;
    expect(formatCliError(error)).toContain('stack unavailable');
  });

  it('handles circular causes', () => {
    const error = new Error('circular failure');
    error.cause = error;

    expect(formatCliError(error)).toContain('circular failure');
    expect(formatCliError(error)).toContain('[Circular');
  });

  it('reports non-Error thrown values', () => {
    expect(formatCliError('plain failure')).toBe('plain failure');
    expect(
      formatCliError({ code: 'BROKEN', message: 'object failure' }),
    ).toContain('object failure');
    expect(formatCliError(null)).toBe('null');
    expect(formatCliError(undefined)).toBe('undefined');
  });
});
