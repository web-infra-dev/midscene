import type { MidsceneYamlConfigResult } from '@midscene/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  printExecutionPlan,
  printExecutionSummary,
} from '../../src/execution-summary';

const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

afterEach(() => {
  consoleLog.mockClear();
});

describe('execution summary', () => {
  test('prints the configured retry count in the execution plan', () => {
    printExecutionPlan({
      files: ['/tmp/case.yaml'],
      concurrent: 1,
      continueOnError: false,
      retry: 2,
      summary: 'summary.json',
      shareBrowserContext: false,
      headed: false,
      keepWindow: false,
    });

    expect(consoleLog).toHaveBeenCalledWith('   Retry: 2');
  });

  test('prints failed file error details', () => {
    const results: MidsceneYamlConfigResult[] = [
      {
        file: '/tmp/failed.yaml',
        success: false,
        executed: true,
        duration: 12,
        resultType: 'failed',
        error: 'Assertion failed: expected page title',
      },
    ];

    const success = printExecutionSummary(results, '/tmp/summary.json');

    expect(success).toBe(false);
    expect(consoleLog).toHaveBeenCalledWith(
      '     Error: Assertion failed: expected page title',
    );
  });
});
