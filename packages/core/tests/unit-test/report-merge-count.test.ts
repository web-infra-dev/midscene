/**
 * Verify that ReportMergingTool does not lose test cases after merging.
 *
 * Strategy:
 * 1. Use reportHTMLContent to produce N independent reports
 * 2. Merge them with ReportMergingTool
 * 3. Assert the number of real dump scripts in the merged file === N
 * 4. Assert every dump can be parsed correctly
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractLastDumpScriptSync } from '@/dump/html-utils';
import { ReportMergingTool } from '@/report';
import { ScreenshotItem } from '@/screenshot-item';
import {
  ExecutionDump,
  GroupedActionDump,
  type TestStatus,
  type UIContext,
} from '@/types';
import { reportHTMLContent } from '@/utils';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { describe, expect, it } from 'vitest';

// ---------- helpers ----------

function fakeScreenshot(size = 200): ScreenshotItem {
  return ScreenshotItem.create(
    `data:image/png;base64,${'A'.repeat(size)}`,
    Date.now(),
  );
}

function createDump(groupName: string, taskCount: number): GroupedActionDump {
  const tasks = Array.from({ length: taskCount }, (_, i) => ({
    type: 'Insight' as const,
    subType: 'Locate',
    param: { prompt: `${groupName}-task-${i}` },
    taskId: `${groupName}-task-${i}`,
    uiContext: {
      screenshot: fakeScreenshot(),
      shotSize: { width: 1920, height: 1080 },
      shrunkShotToLogicalRatio: 1,
    } as unknown as UIContext,
    executor: async () => undefined,
    recorder: [],
    status: 'finished' as const,
  }));

  return new GroupedActionDump({
    sdkVersion: '1.0.0-test',
    groupName,
    groupDescription: `desc of ${groupName}`,
    modelBriefs: ['test-model'],
    executions: [
      new ExecutionDump({
        logTime: Date.now(),
        name: 'exec',
        tasks: tasks as any,
      }),
    ],
  });
}

/** Write a single-HTML report and return its path. */
function writeInlineReport(name: string, dump: GroupedActionDump): string {
  const reportPath = join(getMidsceneRunSubDir('report'), `${name}.html`);
  reportHTMLContent(dump.serializeWithInlineScreenshots(), reportPath);
  return reportPath;
}

/**
 * Count dump scripts that have a `playwright_test_id` attribute.
 * Only dumps written by mergeReports carry this attribute;
 * false positives from template JS code do not.
 */
function countRealDumpScripts(html: string): number {
  const re =
    /<script type="midscene_web_dump"[^>]*playwright_test_id="[^"]*"[^>]*>/g;
  return (html.match(re) || []).length;
}

/** Extract all dump scripts that carry playwright attributes. */
function extractAllDumps(html: string) {
  const results: {
    testId: string;
    testTitle: string;
    testStatus: string;
    groupName: string | null;
  }[] = [];

  const openPattern = '<script type="midscene_web_dump"';
  const closeTag = '</script>';

  let pos = 0;
  while (true) {
    const openIdx = html.indexOf(openPattern, pos);
    if (openIdx === -1) break;

    const tagEndIdx = html.indexOf('>', openIdx);
    const closeIdx = html.indexOf(closeTag, tagEndIdx);
    if (tagEndIdx === -1 || closeIdx === -1) break;

    const openTag = html.substring(openIdx, tagEndIdx + 1);

    // Only process dumps written by the merge tool (have playwright_test_id)
    const idMatch = openTag.match(/playwright_test_id="([^"]*)"/);
    if (!idMatch) {
      pos = closeIdx + closeTag.length;
      continue;
    }

    const titleMatch = openTag.match(/playwright_test_title="([^"]*)"/);
    const statusMatch = openTag.match(/playwright_test_status="([^"]*)"/);
    const content = html.substring(tagEndIdx + 1, closeIdx).trim();

    let groupName: string | null = null;
    try {
      const unescaped = antiEscapeScriptTag(content);
      const parsed = JSON.parse(unescaped);
      groupName = parsed.groupName ?? null;
    } catch {
      // parse failed
    }

    results.push({
      testId: decodeURIComponent(idMatch[1]),
      testTitle: titleMatch ? decodeURIComponent(titleMatch[1]) : '',
      testStatus: statusMatch ? decodeURIComponent(statusMatch[1]) : '',
      groupName,
    });

    pos = closeIdx + closeTag.length;
  }
  return results;
}

// ---------- tests ----------

describe('ReportMergingTool merged dump count verification', () => {
  /**
   * Core test: generate N reports (inline mode),
   * merge them, and verify the dump count matches.
   */
  it.each([2, 3, 5, 10])(
    'merging %i inline reports preserves all dumps',
    async (n) => {
      const tool = new ReportMergingTool();

      for (let i = 0; i < n; i++) {
        const dump = createDump(`group-${i}`, 2);
        const reportPath = writeInlineReport(
          `merge-count-inline-${n}-${i}`,
          dump,
        );

        tool.append({
          reportFilePath: reportPath,
          reportAttributes: {
            testDescription: `Test case ${i}`,
            testDuration: 1000 + i,
            testId: `inline-${n}-${i}`,
            testStatus: 'passed' as TestStatus,
            testTitle: `Test ${i}`,
          },
        });
      }

      const mergedPath = tool.mergeReports(`merge-count-inline-${n}-merged`, {
        overwrite: true,
      });
      expect(mergedPath).toBeTruthy();

      const html = readFileSync(mergedPath!, 'utf-8');
      const realCount = countRealDumpScripts(html);
      const dumps = extractAllDumps(html);

      console.log(
        `[inline n=${n}] size=${(html.length / 1024 / 1024).toFixed(1)}MB, ` +
          `realDumps=${realCount}, parsed=${dumps.length}`,
      );

      expect(realCount).toBe(n);
      expect(dumps.length).toBe(n);

      for (let i = 0; i < n; i++) {
        expect(dumps[i].testId).toBe(`inline-${n}-${i}`);
        expect(dumps[i].groupName).toBe(`group-${i}`);
        expect(dumps[i].testStatus).toBe('passed');
      }
    },
  );

  /**
   * Simulate mixed pass/fail statuses.
   */
  it('merging reports with mixed statuses preserves all dumps', async () => {
    const tool = new ReportMergingTool();
    const statuses: TestStatus[] = [
      'passed',
      'failed',
      'passed',
      'timedOut',
      'passed',
    ];

    for (let i = 0; i < statuses.length; i++) {
      const dump = createDump(`status-group-${i}`, 1);
      const reportPath = writeInlineReport(`merge-count-status-${i}`, dump);
      tool.append({
        reportFilePath: reportPath,
        reportAttributes: {
          testDescription: `Status test ${i}`,
          testDuration: 500,
          testId: `status-${i}`,
          testStatus: statuses[i],
          testTitle: `Status Test ${i}`,
        },
      });
    }

    const mergedPath = tool.mergeReports('merge-count-status-merged', {
      overwrite: true,
    });

    const html = readFileSync(mergedPath!, 'utf-8');
    const dumps = extractAllDumps(html);

    console.log(
      `[status n=${statuses.length}] realDumps=${dumps.length}, ` +
        `statuses=${dumps.map((d) => d.testStatus).join(',')}`,
    );

    expect(dumps.length).toBe(statuses.length);
    for (let i = 0; i < statuses.length; i++) {
      expect(dumps[i].testStatus).toBe(statuses[i]);
    }
  });

  /**
   * extractLastDumpScriptSync should return the last dump from a merged file.
   */
  it('extractLastDumpScriptSync returns the last dump from merged file', async () => {
    const tool = new ReportMergingTool();
    const n = 4;

    for (let i = 0; i < n; i++) {
      const dump = createDump(`last-group-${i}`, 1);
      const reportPath = writeInlineReport(`merge-count-last-${i}`, dump);
      tool.append({
        reportFilePath: reportPath,
        reportAttributes: {
          testDescription: `Last test ${i}`,
          testDuration: 100,
          testId: `last-${i}`,
          testStatus: 'passed' as TestStatus,
          testTitle: `Last Test ${i}`,
        },
      });
    }

    const mergedPath = tool.mergeReports('merge-count-last-merged', {
      overwrite: true,
    });

    const lastDump = extractLastDumpScriptSync(mergedPath!);
    const parsed = JSON.parse(antiEscapeScriptTag(lastDump));

    console.log(`[extractLast] last groupName=${parsed.groupName}`);

    expect(parsed.groupName).toBe(`last-group-${n - 1}`);
  });
});
