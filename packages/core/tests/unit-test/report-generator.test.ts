import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  parseDumpScript,
  parseImageScripts,
  unescapeContent,
} from '@/dump/html-utils';
import * as reportDumpCompactor from '@/dump/report-dump-compactor';
import { ReportGenerator } from '@/report-generator';
import { ScreenshotItem } from '@/screenshot-item';
import { ExecutionDump, ReportActionDump, type UIContext } from '@/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildIncrementalExecution,
  createExecution,
  defaultReportMeta,
  fakeBase64,
  getReportGeneratorTmpDir,
  parseScriptAttributes,
} from './test-helpers/report-generator';
import {
  countGroupedDumpScripts,
  extractGroupedDumpScripts,
} from './test-helpers/report-html';

describe('ReportGenerator — append-only model', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = getReportGeneratorTmpDir('report-gen');
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Writer contract for the self-describing screenshot mode. The merger reads
  // this attribute back to decide directory vs inline, so the generated value
  // must match for both modes (see report.ts readDeclaredScreenshotMode).
  describe('data-screenshot-mode attribute', () => {
    it.each(['inline', 'directory'] as const)(
      'stamps data-screenshot-mode="%s" on the dump script tag',
      async (mode) => {
        const reportPath =
          mode === 'directory'
            ? join(tmpDir, 'dir-mode', 'index.html')
            : join(tmpDir, 'inline-mode.html');
        const generator = new ReportGenerator({
          reportPath,
          screenshotMode: mode,
          autoPrint: false,
        });
        generator.onExecutionUpdate(
          createExecution([ScreenshotItem.create(fakeBase64(100), Date.now())]),
          defaultReportMeta,
        );
        await generator.finalize();

        const html = readFileSync(reportPath, 'utf-8');
        expect(html).toContain(`data-screenshot-mode="${mode}"`);
      },
    );
  });

  describe('inline mode — append-only strategy', () => {
    it('should write each screenshot image tag exactly once across multiple updates', async () => {
      const reportPath = join(tmpDir, 'inline-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const allScreenshots: ScreenshotItem[] = [];
      const rounds = 5;
      const screenshotSize = 1000;

      for (let i = 0; i < rounds; i++) {
        const newScreenshot = ScreenshotItem.create(
          fakeBase64(screenshotSize),
          Date.now(),
        );
        const execution = buildIncrementalExecution(
          allScreenshots,
          newScreenshot,
        );
        generator.onExecutionUpdate(execution, defaultReportMeta);
      }
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      const imageMap = parseImageScripts(html);

      for (const s of allScreenshots) {
        expect(imageMap[s.id]).toBeDefined();
        expect(imageMap[s.id]).toContain('AAAA');
      }
    });

    it('should not duplicate image tags when same execution is written multiple times', async () => {
      const reportPath = join(tmpDir, 'dedup-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(500), Date.now());
      const execution = createExecution([screenshot]);

      for (let i = 0; i < 10; i++) {
        generator.onExecutionUpdate(execution, defaultReportMeta);
      }
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      const imageMap = parseImageScripts(html);

      expect(imageMap[screenshot.id]).toBeDefined();
      expect(imageMap[screenshot.id]).toContain('AAAA');
    });

    it('should append dump tags on each update (frontend deduplicates)', async () => {
      const reportPath = join(tmpDir, 'append-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      // Should have 3 dump tags (one per update), frontend keeps only last
      expect(countGroupedDumpScripts(html)).toBe(3);
    });

    it('should remove superseded dump tags when the report is finalized', async () => {
      const reportPath = join(tmpDir, 'finalize-compacts-dumps.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const firstScreenshot = ScreenshotItem.create(
        fakeBase64(100),
        Date.now(),
      );
      const secondScreenshot = ScreenshotItem.create(
        fakeBase64(120),
        Date.now(),
      );
      const executionId = 'execution-updated-before-finalize';

      generator.onExecutionUpdate(
        createExecution([firstScreenshot], 'finalize-compact', executionId),
        defaultReportMeta,
      );
      await generator.flush();
      generator.onExecutionUpdate(
        createExecution(
          [firstScreenshot, secondScreenshot],
          'finalize-compact',
          executionId,
        ),
        defaultReportMeta,
      );
      await generator.flush();

      const runningHtml = readFileSync(reportPath, 'utf-8');
      expect(countGroupedDumpScripts(runningHtml)).toBe(2);

      await generator.finalize();

      const finalizedHtml = readFileSync(reportPath, 'utf-8');
      const dumpScripts = extractGroupedDumpScripts(finalizedHtml);
      expect(dumpScripts).toHaveLength(1);

      const finalDump = JSON.parse(unescapeContent(dumpScripts[0].content));
      expect(finalDump.executions).toHaveLength(1);
      expect(finalDump.executions[0].id).toBe(executionId);
      expect(finalDump.executions[0].tasks).toHaveLength(2);
    });

    it('should preserve a successful report when final compaction fails', async () => {
      const reportPath = join(tmpDir, 'finalize-compaction-failure.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      generator.onExecutionUpdate(
        createExecution([], 'compaction-failure'),
        defaultReportMeta,
      );

      const compactionError = new Error('ENOSPC: no space left on device');
      const compactSpy = vi
        .spyOn(reportDumpCompactor, 'compactReportDumps')
        .mockRejectedValueOnce(compactionError);

      try {
        await expect(generator.finalize()).resolves.toBe(reportPath);
      } finally {
        compactSpy.mockRestore();
      }

      const finalizedHtml = readFileSync(reportPath, 'utf-8');
      expect(finalizedHtml).toContain('compaction-failure');
      expect(countGroupedDumpScripts(finalizedHtml)).toBeGreaterThan(0);
    });

    it('should overwrite existing report file by default when a new generator uses the same path', async () => {
      const reportPath = join(tmpDir, 'append-existing-report.html');
      const firstGenerator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const firstScreenshot = ScreenshotItem.create(
        fakeBase64(100),
        Date.now(),
      );
      firstGenerator.onExecutionUpdate(
        createExecution([firstScreenshot], 'first-execution', 'exec-1'),
        defaultReportMeta,
      );
      await firstGenerator.finalize();

      const secondGenerator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });
      const secondScreenshot = ScreenshotItem.create(
        fakeBase64(120),
        Date.now(),
      );
      secondGenerator.onExecutionUpdate(
        createExecution([secondScreenshot], 'second-execution', 'exec-2'),
        defaultReportMeta,
      );
      await secondGenerator.finalize();

      const html = readFileSync(reportPath, 'utf-8');
      // Finalized reports contain one compacted dump for the active group.
      expect(countGroupedDumpScripts(html)).toBe(1);
      expect(html).not.toContain(firstScreenshot.id);
      expect(html).toContain(secondScreenshot.id);
    });

    it('should append and override report attributes across updates', async () => {
      const reportPath = join(tmpDir, 'attribute-merge-inline.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta, {
        playwright_test_title: 'initial title',
        playwright_test_status: 'running',
        playwright_test_duration: 123,
        ignored_null: null,
        ignored_undefined: undefined,
        'data-group-id': 'external-group-id',
      });
      await generator.flush();

      generator.onExecutionUpdate(execution, defaultReportMeta, {
        playwright_test_status: 'passed',
        playwright_test_description: 'new description',
      });
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      const dumpScripts = extractGroupedDumpScripts(html);
      expect(dumpScripts).toHaveLength(2);

      const firstAttrs = parseScriptAttributes(dumpScripts[0].openTag);
      expect(firstAttrs.playwright_test_title).toBe('initial title');
      expect(firstAttrs.playwright_test_status).toBe('running');
      expect(firstAttrs.playwright_test_duration).toBe('123');
      expect(firstAttrs.ignored_null).toBeUndefined();
      expect(firstAttrs.ignored_undefined).toBeUndefined();
      expect(firstAttrs['data-group-id']).toBe('external-group-id');

      const secondAttrs = parseScriptAttributes(dumpScripts[1].openTag);
      expect(secondAttrs['data-group-id']).toBe('external-group-id');
      expect(secondAttrs.playwright_test_title).toBe('initial title');
      expect(secondAttrs.playwright_test_status).toBe('passed');
      expect(secondAttrs.playwright_test_duration).toBe('123');
      expect(secondAttrs.playwright_test_description).toBe('new description');
    });

    it('should replace persisted execution dump file for same execution id', async () => {
      const reportPath = join(tmpDir, 'inline-execution-json.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot], 'execution-json-test');

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();
      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      const jsonFiles = readdirSync(tmpDir)
        .filter((name) => /^\d+\.execution\.json$/.test(name))
        .sort();
      expect(jsonFiles).toEqual(['1.execution.json']);
      expect(
        existsSync(join(tmpDir, 'screenshots', `${screenshot.id}.png`)),
      ).toBe(true);

      const firstDump = JSON.parse(
        readFileSync(join(tmpDir, '1.execution.json'), 'utf-8'),
      );
      expect(firstDump.groupName).toBe('test-group');
      expect(firstDump.executions).toHaveLength(1);
      expect(firstDump.executions[0].name).toBe('execution-json-test');
      expect(firstDump.executions[0].tasks[0].uiContext.screenshot.id).toBe(
        screenshot.id,
      );
    });

    it('should continue execution dump index when appending with reuseExistingReport enabled', async () => {
      const reportPath = join(tmpDir, 'append-existing-report-with-json.html');
      const firstGenerator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
        reuseExistingReport: true,
      });
      firstGenerator.onExecutionUpdate(
        createExecution(
          [ScreenshotItem.create(fakeBase64(90), Date.now())],
          'first-execution',
          'first-id',
        ),
        defaultReportMeta,
      );
      await firstGenerator.finalize();

      const secondGenerator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
        reuseExistingReport: true,
      });
      secondGenerator.onExecutionUpdate(
        createExecution(
          [ScreenshotItem.create(fakeBase64(110), Date.now())],
          'second-execution',
          'second-id',
        ),
        defaultReportMeta,
      );
      await secondGenerator.finalize();

      const jsonFiles = readdirSync(tmpDir)
        .filter((name) => /^\d+\.execution\.json$/.test(name))
        .sort();
      expect(jsonFiles).toEqual(['1.execution.json', '2.execution.json']);
    });

    it('should persist execution dump files with pretty-printed JSON', async () => {
      const reportPath = join(tmpDir, 'pretty-execution-json.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot], 'pretty-json-test');

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      const dumpContent = readFileSync(
        join(tmpDir, '1.execution.json'),
        'utf-8',
      );
      expect(dumpContent).toContain('\n  "groupName": "test-group"');
      expect(dumpContent).toContain('\n    {');
      expect(dumpContent.endsWith('\n')).toBe(false);
    });

    it('should skip persisting execution dump files when persistExecutionDump is false', async () => {
      const reportPath = join(tmpDir, 'inline-no-execution-json.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: false,
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot], 'execution-json-test');

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      const rootFiles = readdirSync(tmpDir).filter((name) =>
        /^\d+\.execution\.json(?:\.screenshots)?$/.test(name),
      );
      expect(rootFiles).toEqual([]);
    });

    it('should append new execution screenshots without rewriting existing files', async () => {
      const reportPath = join(
        tmpDir,
        'inline-execution-screenshots-append.html',
      );
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const screenshot2 = ScreenshotItem.create(fakeBase64(200), Date.now());
      const executionId = 'same-execution-id';

      const firstExecution = createExecution(
        [screenshot1],
        'execution-json-test',
        executionId,
      );
      generator.onExecutionUpdate(firstExecution, defaultReportMeta);
      await generator.flush();

      const screenshotPath1 = join(
        tmpDir,
        'screenshots',
        `${screenshot1.id}.png`,
      );
      const mtimeFirst = statSync(screenshotPath1).mtimeMs;

      const startTime = Date.now();
      while (Date.now() - startTime < 50) {
        // busy wait
      }

      const secondExecution = createExecution(
        [screenshot1, screenshot2],
        'execution-json-test',
        executionId,
      );
      generator.onExecutionUpdate(secondExecution, defaultReportMeta);
      await generator.flush();

      const mtimeSecond = statSync(screenshotPath1).mtimeMs;
      expect(mtimeSecond).toBe(mtimeFirst);
      expect(
        existsSync(join(tmpDir, 'screenshots', `${screenshot2.id}.png`)),
      ).toBe(true);
    });

    it('should produce valid HTML with parseable image map and dump JSON', async () => {
      const reportPath = join(tmpDir, 'valid-html-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const screenshot2 = ScreenshotItem.create(fakeBase64(200), Date.now());

      // Round 1: one screenshot
      const sharedId = 'same-exec-id';
      const exec1 = createExecution([screenshot1], 'test-execution', sharedId);
      generator.onExecutionUpdate(exec1, defaultReportMeta);

      // Round 2: two screenshots (same execution id = update)
      const exec2 = createExecution(
        [screenshot1, screenshot2],
        'test-execution',
        sharedId,
      );
      generator.onExecutionUpdate(exec2, defaultReportMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      expect(html).toContain('Midscene');

      const imageMap = parseImageScripts(html);
      expect(imageMap[screenshot1.id]).toBeDefined();
      expect(imageMap[screenshot2.id]).toBeDefined();

      // Should have 2 dump tags (one per update), last one has the final state
      const dumpScripts = extractGroupedDumpScripts(html);
      expect(dumpScripts).toHaveLength(2);

      // Parse the last dump tag — it should have the complete execution
      const lastDump = unescapeContent(
        dumpScripts[dumpScripts.length - 1].content,
      );
      const parsed = JSON.parse(lastDump);
      expect(parsed.groupName).toBe('test-group');
      expect(parsed.executions).toHaveLength(1);
      expect(parsed.executions[0].tasks).toHaveLength(2);
    });

    it('should produce dump tags for multiple distinct executions', async () => {
      const reportPath = join(tmpDir, 'multi-exec-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const s1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const s2 = ScreenshotItem.create(fakeBase64(100), Date.now());

      // Write two different executions
      const exec1 = createExecution([s1], 'exec-1');
      generator.onExecutionUpdate(exec1, defaultReportMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'exec-2');
      generator.onExecutionUpdate(exec2, defaultReportMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      // Should have 2 dump tags
      const dumpScripts = extractGroupedDumpScripts(html);
      expect(dumpScripts).toHaveLength(2);

      const jsonFiles = readdirSync(tmpDir)
        .filter((name) => /^\d+\.execution\.json$/.test(name))
        .sort();
      expect(jsonFiles).toEqual(['1.execution.json', '2.execution.json']);

      // Each dump tag should contain exactly 1 execution
      for (const dumpScript of dumpScripts) {
        const dumpJson = unescapeContent(dumpScript.content);
        const parsed = JSON.parse(dumpJson);
        expect(parsed.executions).toHaveLength(1);
      }
    });

    it('should produce separate dump tags for executions with same name but different ids', async () => {
      const reportPath = join(tmpDir, 'same-name-exec-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const s1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const s2 = ScreenshotItem.create(fakeBase64(100), Date.now());

      const exec1 = createExecution([s1], 'Act - click login', 'unique-id-1');
      generator.onExecutionUpdate(exec1, defaultReportMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'Act - click login', 'unique-id-2');
      generator.onExecutionUpdate(exec2, defaultReportMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      expect(countGroupedDumpScripts(html)).toBe(2);
    });

    it('should release screenshot memory immediately after writing', async () => {
      const reportPath = join(tmpDir, 'inline-memory.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(10000), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      // Screenshot memory should be released immediately (no truncation risk)
      expect(screenshot.hasBase64()).toBe(false);

      // But it should be recoverable via lazy loading from HTML
      expect(() => screenshot.base64).not.toThrow();
      expect(screenshot.base64).toContain('data:image/png;base64,');
      expect(screenshot.base64).toContain('AAAA');
    });
  });

  describe('lazy loading — memory release behavior', () => {
    it('should release memory and recover via lazy loading in inline mode', async () => {
      const reportPath = join(tmpDir, 'inline-lazy.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(10000), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      // Screenshot memory released immediately after writing
      expect(screenshot.hasBase64()).toBe(false);

      // Recoverable via lazy loading
      expect(() => screenshot.base64).not.toThrow();
      const recoveredBase64 = screenshot.base64;
      expect(recoveredBase64).toContain('data:image/png;base64,');
      expect(recoveredBase64).toContain('AAAA');
    });

    it('should release all screenshots across multiple executions', async () => {
      const reportPath = join(tmpDir, 'multi-exec-release.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshots: ScreenshotItem[][] = [];
      for (let e = 0; e < 3; e++) {
        const execScreenshots: ScreenshotItem[] = [];
        for (let s = 0; s < 2; s++) {
          execScreenshots.push(
            ScreenshotItem.create(fakeBase64(1000), Date.now()),
          );
        }
        screenshots.push(execScreenshots);

        const execution = createExecution(execScreenshots, `execution-${e}`);
        generator.onExecutionUpdate(execution, defaultReportMeta);
        await generator.flush();
      }

      // All screenshots should be released (append-only, no truncation risk)
      for (const group of screenshots) {
        for (const s of group) {
          expect(s.hasBase64()).toBe(false);
        }
      }

      // All should be recoverable
      for (const group of screenshots) {
        for (const s of group) {
          expect(() => s.base64).not.toThrow();
          expect(s.base64).toContain('data:image/png;base64,');
        }
      }
    });

    it('should handle finalize() correctly', async () => {
      const reportPath = join(tmpDir, 'finalize-lazy.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const s1 = ScreenshotItem.create(fakeBase64(1000), Date.now());
      const s2 = ScreenshotItem.create(fakeBase64(1000), Date.now());

      const exec1 = createExecution([s1], 'execution-0');
      generator.onExecutionUpdate(exec1, defaultReportMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'execution-1');
      generator.onExecutionUpdate(exec2, defaultReportMeta);
      await generator.flush();

      // Both released
      expect(s1.hasBase64()).toBe(false);
      expect(s2.hasBase64()).toBe(false);

      // After finalize: both should be recoverable
      await generator.finalize();
      expect(() => s1.base64).not.toThrow();
      expect(() => s2.base64).not.toThrow();

      const html = readFileSync(reportPath, 'utf-8');
      const agentCommentCount = (html.match(/<!--\nFor Agent Analysis:/g) ?? [])
        .length;
      expect(agentCommentCount).toBe(1);
      expect(html).toContain('Executions: 2; Tasks: 2');

      const dumpScripts = extractGroupedDumpScripts(html);
      expect(dumpScripts).toHaveLength(1);
      const compactedDump = JSON.parse(unescapeContent(dumpScripts[0].content));
      expect(
        compactedDump.executions.map(({ id }: { id: string }) => id),
      ).toEqual([exec1.id, exec2.id]);
    });

    it('keeps same-name executions without id in the agent comment', async () => {
      const reportPath = join(tmpDir, 'no-id-same-name.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });
      const createNoIdExecution = (taskId: string) =>
        new ExecutionDump({
          logTime: Date.now(),
          name: 'same execution name',
          tasks: [
            {
              taskId,
              type: 'Insight',
              subType: 'Locate',
              param: { prompt: taskId },
              executor: async () => undefined,
              recorder: [],
              status: 'finished',
            } as any,
          ],
        });

      generator.onExecutionUpdate(
        createNoIdExecution('task-a'),
        defaultReportMeta,
      );
      generator.onExecutionUpdate(
        createNoIdExecution('task-b'),
        defaultReportMeta,
      );

      await generator.finalize();

      const html = readFileSync(reportPath, 'utf-8');
      expect(html).toContain('Executions: 2; Tasks: 2');

      const dumpScripts = extractGroupedDumpScripts(html);
      expect(dumpScripts).toHaveLength(1);
      const compactedDump = JSON.parse(unescapeContent(dumpScripts[0].content));
      expect(
        compactedDump.executions.map(
          ({ tasks }: { tasks: { taskId: string }[] }) => tasks[0].taskId,
        ),
      ).toEqual(['task-a', 'task-b', 'task-b']);
    });

    it('should work correctly in directory mode with lazy loading', async () => {
      const reportDir = join(tmpDir, 'dir-lazy-loading');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const s1 = ScreenshotItem.create(fakeBase64(1000), Date.now());
      const s2 = ScreenshotItem.create(fakeBase64(1000), Date.now());

      const exec1 = createExecution([s1], 'execution-0');
      generator.onExecutionUpdate(exec1, defaultReportMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'execution-1');
      generator.onExecutionUpdate(exec2, defaultReportMeta);
      await generator.flush();

      // In directory mode, all screenshots are persisted immediately
      for (const s of [s1, s2]) {
        expect(s.hasBase64()).toBe(false);
        const serialized = s.toSerializable();
        expect(serialized).toMatchObject({
          type: 'midscene_screenshot_ref',
          storage: 'file',
        });
        expect((serialized as { path: string }).path).toContain('screenshots');
      }

      for (const s of [s1, s2]) {
        expect(() => s.base64).not.toThrow();
        expect(s.base64).toContain('data:image/png;base64,');
      }
    });

    it('should recover correct data for each screenshot (inline mode)', async () => {
      const reportPath = join(tmpDir, 'inline-correct-recovery.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const screenshot2 = ScreenshotItem.create(fakeBase64(200), Date.now());
      const screenshot3 = ScreenshotItem.create(fakeBase64(300), Date.now());

      const execution = createExecution(
        [screenshot1, screenshot2, screenshot3],
        'exec-1',
      );
      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      // All released immediately
      expect(screenshot1.hasBase64()).toBe(false);
      expect(screenshot2.hasBase64()).toBe(false);
      expect(screenshot3.hasBase64()).toBe(false);

      const recovered1 = screenshot1.rawBase64;
      const recovered2 = screenshot2.rawBase64;
      const recovered3 = screenshot3.rawBase64;

      expect(recovered1.length).toBe(100);
      expect(recovered2.length).toBe(200);
      expect(recovered3.length).toBe(300);
    });
  });

  describe('memory efficiency — screenshotStore tracking', () => {
    it('screenshotStore tracking sets should contain only IDs, not base64 data', async () => {
      const reportPath = join(tmpDir, 'tracking-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const largeScreenshot = ScreenshotItem.create(
        fakeBase64(100_000),
        Date.now(),
      );
      const execution = createExecution([largeScreenshot], 'exec-1');
      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      const writtenInlineScreenshots = (generator as any).screenshotStore
        .writtenInlineIds as Set<string>;
      expect(writtenInlineScreenshots.size).toBe(1);

      const storedValue = [...writtenInlineScreenshots][0];
      expect(storedValue).toBe(largeScreenshot.id);
      expect(storedValue.length).toBeLessThan(100);

      const writtenFileScreenshots = (generator as any).screenshotStore
        .writtenFileIds as Set<string>;
      expect(writtenFileScreenshots.size).toBe(1);
      expect([...writtenFileScreenshots][0]).toBe(largeScreenshot.id);
    });
  });
});
