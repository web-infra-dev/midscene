/**
 * Tests that verify the issues identified in PR #2153 review.
 *
 * Each test asserts the CORRECT expected behavior.
 * Tests FAIL on the current code, proving bugs exist.
 * Once fixed, all tests should pass.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractAllDumpScriptsSync } from '@/dump/html-utils';
import { ReportGenerator } from '@/report-generator';
import { ScreenshotItem } from '@/screenshot-item';
import { ExecutionDump, type ReportMeta } from '@/types';
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { describe, expect, it } from 'vitest';
import {
  extractGroupedDumpScripts,
  getGroupedDumpScriptIds,
} from './test-helpers/report-html';

// ---------- helpers ----------

function fakeBase64(sizeBytes: number): string {
  return `data:image/png;base64,${'A'.repeat(sizeBytes)}`;
}

function fakeScreenshot(size = 200): ScreenshotItem {
  return ScreenshotItem.create(fakeBase64(size), Date.now());
}

let execIdCounter = 0;

function createExecution(
  screenshots: ScreenshotItem[],
  name = 'test-execution',
  id?: string,
): ExecutionDump {
  const tasks = screenshots.map((s, i) => ({
    taskId: `task-${i}`,
    type: 'Insight' as const,
    subType: 'Locate',
    param: { prompt: `task-${i}` },
    uiContext: {
      screenshot: s,
      shotSize: { width: 1920, height: 1080 },
      shrunkShotToLogicalRatio: 1,
    },
    executor: async () => undefined,
    recorder: [],
    status: 'running' as const,
  }));

  return new ExecutionDump({
    id: id ?? `issue-test-exec-${++execIdCounter}`,
    logTime: Date.now(),
    name,
    tasks,
  });
}

const defaultReportMeta: ReportMeta = {
  groupName: 'test-group',
  groupDescription: 'test',
  sdkVersion: '1.0.0-test',
  modelBriefs: [],
};

function getTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `midscene-issue-test-${prefix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------- Issue 2: groupName collision ----------

describe('Issue 2: default groupName causes unrelated reports to merge', () => {
  /**
   * When multiple ReportGenerator instances use the default groupName "Midscene Report",
   * their data-group-id attributes will be identical, causing the Viewer to
   * incorrectly merge unrelated executions into one group.
   */
  it('two generators with same groupName produce identical data-group-id', async () => {
    const tmpDir = getTmpDir('groupname-collision');

    const gen1 = new ReportGenerator({
      reportPath: join(tmpDir, 'report1.html'),
      screenshotMode: 'inline',
      autoPrint: false,
    });
    const gen2 = new ReportGenerator({
      reportPath: join(tmpDir, 'report2.html'),
      screenshotMode: 'inline',
      autoPrint: false,
    });

    const sameReportMeta: ReportMeta = {
      groupName: 'Midscene Report', // default groupName
      sdkVersion: '1.0.0',
      modelBriefs: [],
    };

    const exec1 = createExecution([fakeScreenshot()], 'exec-from-report-1');
    gen1.onExecutionUpdate(exec1, sameReportMeta);
    await gen1.flush();

    const exec2 = createExecution([fakeScreenshot()], 'exec-from-report-2');
    gen2.onExecutionUpdate(exec2, sameReportMeta);
    await gen2.flush();

    const html1 = readFileSync(join(tmpDir, 'report1.html'), 'utf-8');
    const html2 = readFileSync(join(tmpDir, 'report2.html'), 'utf-8');

    const [groupId1] = getGroupedDumpScriptIds(html1);
    const [groupId2] = getGroupedDumpScriptIds(html2);

    expect(groupId1).toBeDefined();
    expect(groupId2).toBeDefined();

    // Each generator should produce a unique data-group-id, not the shared groupName.
    // Currently both are "Midscene Report" — unrelated reports will collide.
    expect(groupId1).not.toBe(groupId2);
  });
});

// ---------- Issue 3: dedup key merges unrelated old executions ----------

describe('Issue 3: execution persistence requires id', () => {
  /**
   * Old ExecutionDump entries have no `id` field. The dedup logic uses
   * `exec.id || exec.name` as key. When multiple old executions share the
   * same name (e.g. "Act - click login"), they get incorrectly merged
   * (only the last one survives).
   */
  it('should throw when execution id is missing', async () => {
    const tmpDir = getTmpDir('dedup-old');

    const gen = new ReportGenerator({
      reportPath: join(tmpDir, 'dedup-old.html'),
      screenshotMode: 'inline',
      autoPrint: false,
    });

    const groupMeta: ReportMeta = {
      groupName: 'dedup-test',
      sdkVersion: '1.0.0',
      modelBriefs: [],
    };

    // Simulate two different executions with the SAME name but NO id
    // (as old-format data would have)
    const exec1 = new ExecutionDump({
      // no id field — simulates old format
      logTime: Date.now(),
      name: 'Act - click login',
      tasks: [
        {
          type: 'Insight' as const,
          subType: 'Locate',
          param: { prompt: 'first-click' },
          taskId: 'task-first',
          uiContext: {
            screenshot: fakeScreenshot(),
            shotSize: { width: 1920, height: 1080 },
            shrunkShotToLogicalRatio: 1,
          },
          executor: async () => undefined,
          recorder: [],
          status: 'finished' as const,
        } as any,
      ],
    });

    const exec2 = new ExecutionDump({
      // no id field — simulates old format
      logTime: Date.now() + 1000,
      name: 'Act - click login', // same name!
      tasks: [
        {
          type: 'Insight' as const,
          subType: 'Locate',
          param: { prompt: 'second-click' },
          taskId: 'task-second',
          uiContext: {
            screenshot: fakeScreenshot(),
            shotSize: { width: 1920, height: 1080 },
            shrunkShotToLogicalRatio: 1,
          },
          executor: async () => undefined,
          recorder: [],
          status: 'finished' as const,
        } as any,
      ],
    });

    gen.onExecutionUpdate(exec1, groupMeta);
    await expect(gen.flush()).rejects.toThrow(
      'execution.id is required for persisting execution dumps',
    );
  });
});

// ---------- Issue 4: finalize() with zero executions ----------

describe('Issue 4: finalize() with zero execution updates', () => {
  it('should not return a file path when no executions were written', async () => {
    const tmpDir = getTmpDir('zero-exec');
    const reportPath = join(tmpDir, 'empty-report.html');

    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'inline',
      autoPrint: false,
    });

    // finalize without any onExecutionUpdate calls
    const result = await generator.finalize();

    // No file should exist since no executions were written
    expect(existsSync(reportPath)).toBe(false);

    // finalize() should return undefined when no report was actually created
    expect(result).toBeUndefined();
  });
});

// ---------- Issue 5: destroy() doesn't write final state ----------

describe('Issue 5: final execution state may not be written', () => {
  /**
   * After the last onExecutionUpdate, if the execution's tasks change status
   * (e.g. running → finished), Agent.destroy() calls finalize() without
   * re-writing the latest state. The report will show stale task statuses.
   *
   * This test verifies the pattern at the ReportGenerator level:
   * if you flush, then mutate, then finalize — the mutation is lost.
   */
  it('mutations after last onExecutionUpdate are not captured by finalize', async () => {
    const tmpDir = getTmpDir('final-state');
    const reportPath = join(tmpDir, 'final-state.html');

    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'inline',
      autoPrint: false,
    });

    const screenshot = fakeScreenshot();
    const execution = createExecution([screenshot], 'mutable-exec');

    // The task starts as 'running'
    expect(execution.tasks[0].status).toBe('running');

    generator.onExecutionUpdate(execution, defaultReportMeta);
    await generator.flush();

    // Now the task finishes (agent would do this)
    (execution.tasks[0] as any).status = 'finished';

    // finalize() — does NOT re-write the execution
    await generator.finalize();

    // Read the report and check the task status
    const html = readFileSync(reportPath, 'utf-8');
    const dumpScripts = extractGroupedDumpScripts(html);
    const lastDump = dumpScripts[dumpScripts.length - 1];
    const parsed = JSON.parse(antiEscapeScriptTag(lastDump.content));

    // The report should reflect the final state ('finished'), not the stale
    // state ('running') that was captured before the mutation.
    expect(parsed.executions[0].tasks[0].status).toBe('finished');
  });
});
