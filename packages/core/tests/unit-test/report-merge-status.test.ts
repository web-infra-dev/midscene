/**
 * Regression test for the merged-report status bug.
 *
 * `mergeReportFiles` used to hardcode every merged case to `passed`, so a
 * report bundling a passing case and a failing case showed both as Passed in
 * the overview sidebar. The merged HTML must instead reflect each case's real
 * status, derived from its dump (or reused from a source report that already
 * recorded a precise Playwright status).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateDumpScriptTag, generateImageScriptTag } from '../../src/dump';
import { mergeReportFiles } from '../../src/report-cli';
import { ScreenshotItem } from '../../src/screenshot-item';
import {
  ExecutionDump,
  ReportActionDump,
  type TestStatus,
} from '../../src/types';

function fakeBase64(sizeBytes: number): string {
  return `data:image/png;base64,${'A'.repeat(sizeBytes)}`;
}

type TaskShape = {
  status: 'pending' | 'running' | 'finished' | 'failed' | 'cancelled';
  subType?: string;
  errorMessage?: string;
  output?: unknown;
};

function buildExecution(id: string, tasks: TaskShape[]): ExecutionDump {
  const screenshot = ScreenshotItem.create(fakeBase64(80), Date.now());
  return new ExecutionDump({
    id,
    logTime: Date.now(),
    name: `execution-${id}`,
    tasks: tasks.map((task, index) => ({
      taskId: `task-${id}-${index}`,
      type: 'Insight',
      subType: task.subType ?? 'Locate',
      param: { prompt: 'find something' },
      uiContext: {
        screenshot,
        shotSize: { width: 1920, height: 1080 },
        shrunkShotToLogicalRatio: 1,
      },
      executor: async () => undefined,
      recorder: [],
      status: task.status,
      ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}),
      ...('output' in task ? { output: task.output } : {}),
    })) as any,
  });
}

/** Extract `playwright_test_status` for every merged dump, in document order. */
function mergedStatuses(html: string): string[] {
  const statuses: string[] = [];
  const openPattern = '<script type="midscene_web_dump"';
  let pos = 0;
  while (true) {
    const openIdx = html.indexOf(openPattern, pos);
    if (openIdx === -1) break;
    const tagEndIdx = html.indexOf('>', openIdx);
    if (tagEndIdx === -1) break;
    const openTag = html.substring(openIdx, tagEndIdx + 1);
    pos = tagEndIdx + 1;
    // Only merged dumps carry playwright_test_id; skip template false-positives.
    if (!/playwright_test_id="[^"]*"/.test(openTag)) continue;
    const match = openTag.match(/playwright_test_status="([^"]*)"/);
    statuses.push(match ? decodeURIComponent(match[1]) : '');
  }
  return statuses;
}

describe('mergeReportFiles status derivation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `midscene-merge-status-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function writeReport(
    dirName: string,
    groupName: string,
    execution: ExecutionDump,
    extraAttributes: Record<string, string> = {},
  ): string {
    const reportPath = join(tmpDir, dirName, 'index.html');
    mkdirSync(join(tmpDir, dirName), { recursive: true });
    const screenshot = ScreenshotItem.create(fakeBase64(80), Date.now());
    const dump = new ReportActionDump({
      groupName,
      groupDescription: `${groupName}-desc`,
      sdkVersion: '1.0.0-test',
      modelBriefs: [],
      executions: [execution],
    });
    const html = [
      generateImageScriptTag(screenshot.id, screenshot.base64),
      generateDumpScriptTag(dump.serialize(), {
        'data-group-id': `group-${groupName}`,
        ...extraAttributes,
      }),
    ].join('\n');
    writeFileSync(reportPath, html, 'utf-8');
    return reportPath;
  }

  it('marks a failing case as failed and a passing case as passed', () => {
    // A real failed Assert throws, leaving the task status === 'failed' with an
    // errorMessage; the passing case finishes cleanly.
    const passReport = writeReport(
      'pass-report',
      'passing-case',
      buildExecution('pass', [{ status: 'finished' }, { status: 'finished' }]),
    );
    const failReport = writeReport(
      'fail-report',
      'failing-case',
      buildExecution('fail', [
        { status: 'finished' },
        {
          status: 'failed',
          subType: 'Assert',
          errorMessage: 'Assertion failed: element not found',
        },
      ]),
    );

    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: [passReport, failReport],
      outputDir: join(tmpDir, 'merged'),
      outputName: 'merged',
    });

    const html = readFileSync(mergedReportPath, 'utf-8');
    expect(mergedStatuses(html)).toEqual(['passed', 'failed']);
  });

  it('preserves a precise status already recorded on the source report', () => {
    // A Playwright-sourced report carries playwright_test_status="timedOut".
    // Even though the dump tasks look finished, the precise status wins.
    const timedOutReport = writeReport(
      'timeout-report',
      'timeout-case',
      buildExecution('timeout', [{ status: 'finished' }]),
      { playwright_test_status: 'timedOut' as TestStatus },
    );

    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: [timedOutReport],
      outputDir: join(tmpDir, 'merged-timeout'),
      outputName: 'merged-timeout',
    });

    const html = readFileSync(mergedReportPath, 'utf-8');
    expect(mergedStatuses(html)).toEqual(['timedOut']);
  });

  it('aggregates a failure across a multi-execution source report', () => {
    // A source report that itself bundles a passing and a failing execution,
    // each carrying its own recorded status. The merged case must surface the
    // failure instead of the first (passing) script's status.
    const reportPath = join(tmpDir, 'bundled-report', 'index.html');
    mkdirSync(join(tmpDir, 'bundled-report'), { recursive: true });
    const screenshot = ScreenshotItem.create(fakeBase64(80), Date.now());
    const buildDump = (groupName: string, exec: ExecutionDump) =>
      new ReportActionDump({
        groupName,
        groupDescription: `${groupName}-desc`,
        sdkVersion: '1.0.0-test',
        modelBriefs: [],
        executions: [exec],
      });
    const html = [
      generateImageScriptTag(screenshot.id, screenshot.base64),
      generateDumpScriptTag(
        buildDump(
          'bundled',
          buildExecution('ok', [{ status: 'finished' }]),
        ).serialize(),
        { 'data-group-id': 'group-bundled', playwright_test_status: 'passed' },
      ),
      generateDumpScriptTag(
        buildDump(
          'bundled',
          buildExecution('bad', [{ status: 'failed', subType: 'Assert' }]),
        ).serialize(),
        { 'data-group-id': 'group-bundled', playwright_test_status: 'failed' },
      ),
    ].join('\n');
    writeFileSync(reportPath, html, 'utf-8');

    const { mergedReportPath } = mergeReportFiles({
      htmlPaths: [reportPath],
      outputDir: join(tmpDir, 'merged-bundled'),
      outputName: 'merged-bundled',
    });

    const merged = readFileSync(mergedReportPath, 'utf-8');
    expect(mergedStatuses(merged)).toEqual(['failed']);
  });
});
