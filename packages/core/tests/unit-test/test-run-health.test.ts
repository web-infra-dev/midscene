import { describe, expect, it } from '@rstest/core';
import {
  type TestRunHealthCase,
  calculateTestRunHealth,
  classifyTestRunCase,
} from '../../src/test-run-health';

const testCase = (
  status: TestRunHealthCase['status'],
  attempts: TestRunHealthCase['attempts'] = [],
  retryCount = 0,
): TestRunHealthCase => ({ status, attempts, retryCount });

describe('Test run health', () => {
  it('uses one retry classification for Case and projected document retries', () => {
    expect(
      classifyTestRunCase(
        testCase('success', [{ attemptIndex: 0, status: 'success' }]),
      ),
    ).toBe('passed');
    expect(
      classifyTestRunCase(
        testCase('success', [
          { attemptIndex: 0, status: 'failed' },
          { attemptIndex: 1, status: 'success' },
        ]),
      ),
    ).toBe('retry-passed');
    expect(
      classifyTestRunCase(
        testCase('success', [{ attemptIndex: 1, status: 'success' }]),
      ),
    ).toBe('retry-passed');
    expect(
      classifyTestRunCase(
        testCase('success', [{ attemptIndex: 0, status: 'success' }], 1),
      ),
    ).toBe('retry-passed');
    expect(classifyTestRunCase(testCase('failed'))).toBe('failed');
    expect(classifyTestRunCase(testCase('not-run'))).toBe('not-run');
  });

  it('calculates counts and rates from the same logical Cases', () => {
    expect(
      calculateTestRunHealth([
        testCase('success', [{ attemptIndex: 0, status: 'success' }]),
        testCase('success', [
          { attemptIndex: 0, status: 'failed' },
          { attemptIndex: 1, status: 'success' },
        ]),
        testCase('failed', [{ attemptIndex: 0, status: 'failed' }]),
        testCase('not-run'),
      ]),
    ).toEqual({
      total: 4,
      executed: 3,
      passed: 2,
      failed: 1,
      notRun: 1,
      firstPassed: 1,
      passedAfterRetry: 1,
      finalPassRate: 2 / 3,
      firstPassRate: 1 / 3,
    });
  });

  it('returns zero rates when no Case was executed', () => {
    expect(calculateTestRunHealth([testCase('not-run')])).toMatchObject({
      executed: 0,
      passedAfterRetry: 0,
      finalPassRate: 0,
      firstPassRate: 0,
    });
    expect(calculateTestRunHealth([])).toMatchObject({
      total: 0,
      executed: 0,
      finalPassRate: 0,
      firstPassRate: 0,
    });
  });
});
