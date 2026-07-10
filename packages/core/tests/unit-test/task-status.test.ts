import { deriveCaseStatus, deriveTaskStatus } from '@/dump/task-status';
import { describe, expect, it } from 'vitest';

describe('deriveTaskStatus', () => {
  it('treats a thrown / failed task as failed', () => {
    expect(
      deriveTaskStatus({
        status: 'failed',
        errorMessage: 'Assertion failed: button not visible',
      }),
    ).toBe('failed');
  });

  it('treats a finished task carrying an error as failed', () => {
    expect(
      deriveTaskStatus({ status: 'finished', error: new Error('x') }),
    ).toBe('failed');
    expect(deriveTaskStatus({ status: 'finished', errorMessage: 'boom' })).toBe(
      'failed',
    );
  });

  it('treats a finished WaitFor with falsy output as a warning', () => {
    expect(
      deriveTaskStatus({
        status: 'finished',
        subType: 'WaitFor',
        output: false,
      }),
    ).toBe('warning');
  });

  it('treats a finished Assert with falsy output as failed (legacy fallback)', () => {
    expect(
      deriveTaskStatus({
        status: 'finished',
        subType: 'Assert',
        output: false,
      }),
    ).toBe('failed');
  });

  it('treats a clean finished task as passed', () => {
    expect(deriveTaskStatus({ status: 'finished' })).toBe('passed');
    expect(
      deriveTaskStatus({ status: 'finished', subType: 'Assert', output: true }),
    ).toBe('passed');
  });

  it('passes through lifecycle statuses', () => {
    expect(deriveTaskStatus({ status: 'pending' })).toBe('pending');
    expect(deriveTaskStatus({ status: 'running' })).toBe('running');
    expect(deriveTaskStatus({ status: 'cancelled' })).toBe('cancelled');
  });
});

describe('deriveCaseStatus', () => {
  it('returns passed when every task passed', () => {
    expect(
      deriveCaseStatus([
        { tasks: [{ status: 'finished' }, { status: 'finished' }] },
      ]),
    ).toBe('passed');
  });

  it('returns failed when any task failed', () => {
    expect(
      deriveCaseStatus([
        {
          tasks: [
            { status: 'finished' },
            { status: 'failed', errorMessage: 'Assertion failed' },
          ],
        },
      ]),
    ).toBe('failed');
  });

  it('does not fail a case for a WaitFor warning alone', () => {
    expect(
      deriveCaseStatus([
        {
          tasks: [
            { status: 'finished' },
            { status: 'finished', subType: 'WaitFor', output: false },
          ],
        },
      ]),
    ).toBe('passed');
  });

  it('handles empty / task-less executions', () => {
    expect(deriveCaseStatus([])).toBe('passed');
    expect(deriveCaseStatus([{}])).toBe('passed');
  });
});
