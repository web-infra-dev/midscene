import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { MidsceneYamlConfigResult } from '@midscene/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  printExecutionPlan,
  printExecutionSummary,
  writeExecutionSummaryFile,
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

  test('writes a retry report with per-attempt statuses', () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-summary-'));
    const runDir = join(root, 'midscene-run');
    const reportDir = join(runDir, 'report');
    const yaml = join(root, 'case.yaml');
    const attemptOneReport = join(reportDir, 'attempt-1.html');
    const attemptTwoReport = join(reportDir, 'attempt-2.html');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;

    const writeFakeReport = (
      file: string,
      groupName: string,
      executionName: string,
    ) => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        `<html><body><script type="midscene_web_dump" data-group-id="${groupName}">{"sdkVersion":"1.9.1","groupName":"${groupName}","groupDescription":"","modelBriefs":[],"executions":[{"id":"${executionName}","name":"${executionName}","tasks":[]}]}</script></body></html>`,
      );
    };

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');
    writeFakeReport(attemptOneReport, 'attempt-one', 'failed-before-retry');
    writeFakeReport(attemptTwoReport, 'attempt-two', 'passed-after-retry');

    try {
      const summaryPath = writeExecutionSummaryFile('summary.json', [
        {
          file: yaml,
          success: true,
          executed: true,
          report: attemptTwoReport,
          duration: 20,
          resultType: 'success',
          attempts: [
            {
              attempt: 1,
              success: false,
              report: attemptOneReport,
              error: 'first attempt failed',
              duration: 10,
              resultType: 'failed',
            },
            {
              attempt: 2,
              success: true,
              report: attemptTwoReport,
              duration: 10,
              resultType: 'success',
            },
          ],
        },
      ]);

      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      expect(summary.results[0].attempts).toMatchObject([
        { attempt: 1, success: false, resultType: 'failed' },
        { attempt: 2, success: true, resultType: 'success' },
      ]);
      expect(summary.results[0].retryReport).toBe(
        '../report/case-retry-attempts.html',
      );

      const retryReportPath = resolve(
        dirname(summaryPath),
        summary.results[0].retryReport,
      );
      const retryReport = readFileSync(retryReportPath, 'utf8');
      expect(retryReport).toContain('playwright_test_status="failed"');
      expect(retryReport).toContain('playwright_test_status="passed"');
      expect(retryReport).toContain('Attempt%201%3A%20failed%20-%20case.yaml');
      expect(retryReport).toContain('Attempt%202%3A%20passed%20-%20case.yaml');
    } finally {
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
