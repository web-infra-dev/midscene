import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  type MidsceneYamlConfigResult,
  ReportMergingTool,
} from '@midscene/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  printExecutionPlan,
  printExecutionSummary,
  writeExecutionSummaryFile,
} from '../../src/execution-summary';

const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

afterEach(() => {
  consoleLog.mockClear();
  consoleWarn.mockClear();
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
      expect(summary.results[0].retryReport).toMatch(
        /^\.\.\/report\/case-[a-f0-9]{8}-retry-attempts\.html$/,
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

  test('writes distinct retry reports for YAML files with duplicate basenames', () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-summary-'));
    const runDir = join(root, 'midscene-run');
    const reportDir = join(runDir, 'report');
    const yamlOne = join(root, 'flows', 'login', 'case.yaml');
    const yamlTwo = join(root, 'checkout', 'case.yaml');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFakeReport(
      join(reportDir, 'login-attempt-1.html'),
      'login-attempt-one',
      'login-failed-before-retry',
    );
    writeFakeReport(
      join(reportDir, 'login-attempt-2.html'),
      'login-attempt-two',
      'login-passed-after-retry',
    );
    writeFakeReport(
      join(reportDir, 'checkout-attempt-1.html'),
      'checkout-attempt-one',
      'checkout-failed-before-retry',
    );
    writeFakeReport(
      join(reportDir, 'checkout-attempt-2.html'),
      'checkout-attempt-two',
      'checkout-passed-after-retry',
    );

    try {
      const summaryPath = writeExecutionSummaryFile('summary.json', [
        {
          file: yamlOne,
          success: true,
          executed: true,
          report: join(reportDir, 'login-attempt-2.html'),
          duration: 20,
          resultType: 'success',
          attempts: [
            {
              attempt: 1,
              success: false,
              report: join(reportDir, 'login-attempt-1.html'),
              duration: 10,
              resultType: 'failed',
            },
            {
              attempt: 2,
              success: true,
              report: join(reportDir, 'login-attempt-2.html'),
              duration: 10,
              resultType: 'success',
            },
          ],
        },
        {
          file: yamlTwo,
          success: true,
          executed: true,
          report: join(reportDir, 'checkout-attempt-2.html'),
          duration: 20,
          resultType: 'success',
          attempts: [
            {
              attempt: 1,
              success: false,
              report: join(reportDir, 'checkout-attempt-1.html'),
              duration: 10,
              resultType: 'failed',
            },
            {
              attempt: 2,
              success: true,
              report: join(reportDir, 'checkout-attempt-2.html'),
              duration: 10,
              resultType: 'success',
            },
          ],
        },
      ]);

      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      const retryReports = summary.results.map(
        (result: { retryReport: string }) => result.retryReport,
      );

      expect(retryReports).toHaveLength(2);
      expect(new Set(retryReports).size).toBe(2);
      expect(retryReports).toEqual([
        expect.stringMatching(
          /^\.\.\/report\/case-[a-f0-9]{8}-retry-attempts\.html$/,
        ),
        expect.stringMatching(
          /^\.\.\/report\/case-[a-f0-9]{8}-retry-attempts\.html$/,
        ),
      ]);
      for (const retryReport of retryReports) {
        expect(existsSync(resolve(dirname(summaryPath), retryReport))).toBe(
          true,
        );
      }
    } finally {
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps writing summary when retry report merging fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-summary-'));
    const runDir = join(root, 'midscene-run');
    const reportDir = join(runDir, 'report');
    const yaml = join(root, 'case.yaml');
    const attemptOneReport = join(reportDir, 'attempt-1.html');
    const attemptTwoReport = join(reportDir, 'attempt-2.html');
    const previousRunDir = process.env.MIDSCENE_RUN_DIR;

    process.env.MIDSCENE_RUN_DIR = runDir;
    writeFileSync(yaml, 'web:\n  url: about:blank\ntasks: []\n');
    writeFakeReport(attemptOneReport, 'attempt-one', 'failed-before-retry');
    writeFakeReport(attemptTwoReport, 'attempt-two', 'failed-after-retry');
    const mergeReports = vi
      .spyOn(ReportMergingTool.prototype, 'mergeReports')
      .mockImplementationOnce(() => {
        throw new Error('merge failed');
      });

    try {
      const summaryPath = writeExecutionSummaryFile('summary.json', [
        {
          file: yaml,
          success: false,
          executed: true,
          report: attemptTwoReport,
          error: 'final attempt failed',
          duration: 20,
          resultType: 'failed',
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
              success: false,
              report: attemptTwoReport,
              error: 'final attempt failed',
              duration: 10,
              resultType: 'failed',
            },
          ],
        },
      ]);

      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      expect(summary.results[0]).not.toHaveProperty('retryReport');
      expect(summary.results[0].attempts).toMatchObject([
        { attempt: 1, success: false, resultType: 'failed' },
        { attempt: 2, success: false, resultType: 'failed' },
      ]);
      expect(consoleWarn).toHaveBeenCalledWith(
        '[Midscene]',
        expect.stringContaining('Failed to merge retry attempt report'),
      );
      expect(mergeReports).toHaveBeenCalled();
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      mergeReports.mockRestore();
      if (previousRunDir === undefined) {
        Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
      } else {
        process.env.MIDSCENE_RUN_DIR = previousRunDir;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
