/**
 * 验证 ReportMergingTool 合并后是否丢失测试用例
 *
 * 测试策略：
 * 1. 用 ReportGenerator 生成 N 个独立报告（模拟真实 agent 用法）
 * 2. 用 ReportMergingTool 合并
 * 3. 检查合并文件中真实的 dump script 数量是否 === N
 * 4. 检查每条 dump 的内容能否正确解析
 */
import { readFileSync } from 'node:fs';
import { extractLastDumpScriptSync } from '@/dump/html-utils';
import { ReportMergingTool } from '@/report';
import { ReportGenerator } from '@/report-generator';
import { ScreenshotItem } from '@/screenshot-item';
import {
  ExecutionDump,
  GroupedActionDump,
  type TestStatus,
  type UIContext,
} from '@/types';
import { antiEscapeScriptTag } from '@midscene/shared/utils';
import { describe, expect, it } from 'vitest';

// ---------- helpers ----------

function fakeScreenshot(size = 200): ScreenshotItem {
  return ScreenshotItem.create(`data:image/png;base64,${'A'.repeat(size)}`);
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

/**
 * 统计合并文件中 **带 playwright_test_id 属性的** dump script 数量
 * 只有 mergeReports 写入的才有这个属性，模板 JS 中的误匹配不会有
 */
function countRealDumpScripts(html: string): number {
  const re =
    /<script type="midscene_web_dump"[^>]*playwright_test_id="[^"]*"[^>]*>/g;
  return (html.match(re) || []).length;
}

/** 提取所有带 playwright 属性的 dump script 的完整信息 */
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

    // 只处理合并写入的 dump（有 playwright_test_id 属性）
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

describe('ReportMergingTool 合并后测试用例计数验证', () => {
  /**
   * 核心测试：用 ReportGenerator（inline 模式）生成 N 个报告，合并后检查数量
   */
  it.each([2, 3, 5, 10])(
    '合并 %i 个 inline 报告后 dump 数量应该完全一致',
    async (n) => {
      const tool = new ReportMergingTool();

      for (let i = 0; i < n; i++) {
        const gen = ReportGenerator.create(`merge-count-inline-${n}-${i}`, {
          generateReport: true,
          outputFormat: 'single-html',
          autoPrintReportMsg: false,
        }) as ReportGenerator;

        const dump = createDump(`group-${i}`, 2);
        await gen.finalize(dump);

        tool.append({
          reportFilePath: gen.getReportPath()!,
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
        `[inline n=${n}] 文件大小=${(html.length / 1024 / 1024).toFixed(1)}MB, ` +
          `真实dump数=${realCount}, 解析出=${dumps.length}`,
      );

      // 核心断言：数量必须一致
      expect(realCount).toBe(n);
      expect(dumps.length).toBe(n);

      // 每条数据都能正确解析
      for (let i = 0; i < n; i++) {
        expect(dumps[i].testId).toBe(`inline-${n}-${i}`);
        expect(dumps[i].groupName).toBe(`group-${i}`);
        expect(dumps[i].testStatus).toBe('passed');
      }
    },
  );

  /**
   * 用 ReportGenerator（directory 模式）生成报告，合并后检查数量
   */
  it('合并 3 个 directory 模式报告后 dump 数量应该完全一致', async () => {
    const n = 3;
    const tool = new ReportMergingTool();

    for (let i = 0; i < n; i++) {
      const gen = ReportGenerator.create(`merge-count-dir-${i}`, {
        generateReport: true,
        outputFormat: 'html-and-external-assets',
        autoPrintReportMsg: false,
      }) as ReportGenerator;

      const dump = createDump(`dir-group-${i}`, 2);
      await gen.finalize(dump);

      tool.append({
        reportFilePath: gen.getReportPath()!,
        reportAttributes: {
          testDescription: `Dir test ${i}`,
          testDuration: 2000 + i,
          testId: `dir-${i}`,
          testStatus: 'passed' as TestStatus,
          testTitle: `Dir Test ${i}`,
        },
      });
    }

    const mergedPath = tool.mergeReports('merge-count-dir-merged', {
      overwrite: true,
    });
    expect(mergedPath).toBeTruthy();

    const html = readFileSync(mergedPath!, 'utf-8');
    const realCount = countRealDumpScripts(html);
    const dumps = extractAllDumps(html);

    console.log(
      `[directory n=${n}] 文件大小=${(html.length / 1024 / 1024).toFixed(1)}MB, ` +
        `真实dump数=${realCount}, 解析出=${dumps.length}`,
    );

    expect(realCount).toBe(n);
    expect(dumps.length).toBe(n);

    for (let i = 0; i < n; i++) {
      expect(dumps[i].testId).toBe(`dir-${i}`);
      expect(dumps[i].groupName).toBe(`dir-group-${i}`);
    }
  });

  /**
   * 混合模式：inline + directory 混合合并
   */
  it('混合 inline 和 directory 报告合并后 dump 数量一致', async () => {
    const tool = new ReportMergingTool();

    // 2 个 inline
    for (let i = 0; i < 2; i++) {
      const gen = ReportGenerator.create(`merge-count-mix-inline-${i}`, {
        generateReport: true,
        outputFormat: 'single-html',
        autoPrintReportMsg: false,
      }) as ReportGenerator;
      await gen.finalize(createDump(`inline-${i}`, 1));
      tool.append({
        reportFilePath: gen.getReportPath()!,
        reportAttributes: {
          testDescription: `Mix inline ${i}`,
          testDuration: 100,
          testId: `mix-inline-${i}`,
          testStatus: 'passed' as TestStatus,
          testTitle: `Mix Inline ${i}`,
        },
      });
    }

    // 2 个 directory
    for (let i = 0; i < 2; i++) {
      const gen = ReportGenerator.create(`merge-count-mix-dir-${i}`, {
        generateReport: true,
        outputFormat: 'html-and-external-assets',
        autoPrintReportMsg: false,
      }) as ReportGenerator;
      await gen.finalize(createDump(`dir-${i}`, 1));
      tool.append({
        reportFilePath: gen.getReportPath()!,
        reportAttributes: {
          testDescription: `Mix dir ${i}`,
          testDuration: 200,
          testId: `mix-dir-${i}`,
          testStatus: 'passed' as TestStatus,
          testTitle: `Mix Dir ${i}`,
        },
      });
    }

    const mergedPath = tool.mergeReports('merge-count-mix-merged', {
      overwrite: true,
    });
    expect(mergedPath).toBeTruthy();

    const html = readFileSync(mergedPath!, 'utf-8');
    const realCount = countRealDumpScripts(html);
    const dumps = extractAllDumps(html);

    console.log(
      `[mixed n=4] 文件大小=${(html.length / 1024 / 1024).toFixed(1)}MB, ` +
        `真实dump数=${realCount}, 解析出=${dumps.length}`,
    );

    expect(realCount).toBe(4);
    expect(dumps.length).toBe(4);

    // 验证顺序和内容
    expect(dumps[0].testId).toBe('mix-inline-0');
    expect(dumps[1].testId).toBe('mix-inline-1');
    expect(dumps[2].testId).toBe('mix-dir-0');
    expect(dumps[3].testId).toBe('mix-dir-1');
  });

  /**
   * 模拟部分测试失败的场景
   */
  it('包含 failed/passed 混合状态的报告合并后数量一致', async () => {
    const tool = new ReportMergingTool();
    const statuses: TestStatus[] = [
      'passed',
      'failed',
      'passed',
      'timedOut',
      'passed',
    ];

    for (let i = 0; i < statuses.length; i++) {
      const gen = ReportGenerator.create(`merge-count-status-${i}`, {
        generateReport: true,
        outputFormat: 'single-html',
        autoPrintReportMsg: false,
      }) as ReportGenerator;
      await gen.finalize(createDump(`status-group-${i}`, 1));
      tool.append({
        reportFilePath: gen.getReportPath()!,
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
      `[status n=${statuses.length}] 真实dump数=${dumps.length}, ` +
        `状态=${dumps.map((d) => d.testStatus).join(',')}`,
    );

    expect(dumps.length).toBe(statuses.length);
    for (let i = 0; i < statuses.length; i++) {
      expect(dumps[i].testStatus).toBe(statuses[i]);
    }
  });

  /**
   * extractLastDumpScriptSync 在合并后的文件上应该返回最后一条
   */
  it('extractLastDumpScriptSync 在合并文件上返回最后一条 dump', async () => {
    const tool = new ReportMergingTool();
    const n = 4;

    for (let i = 0; i < n; i++) {
      const gen = ReportGenerator.create(`merge-count-last-${i}`, {
        generateReport: true,
        outputFormat: 'single-html',
        autoPrintReportMsg: false,
      }) as ReportGenerator;
      await gen.finalize(createDump(`last-group-${i}`, 1));
      tool.append({
        reportFilePath: gen.getReportPath()!,
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

    console.log(`[extractLast] 最后一条 groupName=${parsed.groupName}`);

    expect(parsed.groupName).toBe(`last-group-${n - 1}`);
  });
});
