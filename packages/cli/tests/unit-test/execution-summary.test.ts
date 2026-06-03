import type { MidsceneYamlConfigResult } from '@midscene/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { printExecutionSummary } from '../../src/execution-summary';

const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

afterEach(() => {
  consoleLog.mockClear();
});

describe('execution summary', () => {
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
