import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  parseDumpScript,
  parseImageScripts,
  unescapeContent,
} from '@/dump/html-utils';
import * as reportDumpCompactor from '@/dump/report-dump-compactor';
import { restoreImageReferences } from '@/dump/screenshot-restoration';
import { ReportGenerator, nullReportGenerator } from '@/report-generator';
import { ScreenshotItem } from '@/screenshot-item';
import {
  ExecutionDump,
  type ExecutionTaskPlanningParam,
  ReportActionDump,
  type ReportMeta,
  type UIContext,
} from '@/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countGroupedDumpScripts,
  extractGroupedDumpScripts,
} from './test-helpers/report-html';

/**
 * Create a fake base64 string of a specified size (in bytes).
 * Uses repeating 'A' characters (valid base64).
 */
function fakeBase64(
  sizeBytes: number,
  format: 'png' | 'jpeg' | 'webp' = 'png',
): string {
  return `data:image/${format};base64,${'A'.repeat(sizeBytes)}`;
}

const defaultReportMeta: ReportMeta = {
  groupName: 'test-group',
  groupDescription: 'test',
  sdkVersion: '1.0.0-test',
  modelBriefs: [],
};

/**
 * Create an ExecutionDump with the given screenshots in uiContext.
 */
let execCounter = 0;

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
    id: id ?? `exec-id-${++execCounter}`,
    logTime: Date.now(),
    name,
    tasks,
  });
}

function createPlanningExecutionWithReferenceImage(options: {
  referenceImage: string;
  taskCount: number;
  id: string;
}): ExecutionDump {
  return new ExecutionDump({
    id: options.id,
    logTime: Date.now(),
    name: 'reference-image-dedup',
    tasks: Array.from({ length: options.taskCount }, (_, index) => ({
      taskId: `planning-${index}`,
      type: 'Planning' as const,
      subType: 'Plan',
      param: {
        userInstruction: {
          prompt: 'Compare the current screen with the reference image',
          images: [{ name: 'reference', url: options.referenceImage }],
        },
      },
      executor: async () => undefined,
      recorder: [],
      status: 'finished' as const,
    })),
  });
}

type SerializedReferenceImageRef = {
  type: string;
  id: string;
  storage: string;
  path?: string;
};

type ReferenceImageDump<TImageUrl> = {
  executions: Array<{
    tasks: Array<{
      param: {
        userInstruction: {
          images: Array<{ url: TImageUrl }>;
        };
      };
    }>;
  }>;
};

type SerializedReferenceImageDump =
  ReferenceImageDump<SerializedReferenceImageRef>;
type RestoredReferenceImageDump = ReferenceImageDump<string>;

function referenceImageRefsFromDump(
  dump: SerializedReferenceImageDump,
): SerializedReferenceImageRef[] {
  return dump.executions[0].tasks.map(
    (task) => task.param.userInstruction.images[0].url,
  );
}

function firstPlanningReferenceImageUrl(execution: ExecutionDump): string {
  const param = execution.tasks[0].param as ExecutionTaskPlanningParam;
  const prompt = param.userInstruction;
  if (typeof prompt === 'string' || !prompt.images?.[0]) {
    throw new Error('Expected a planning reference image');
  }
  return prompt.images[0].url;
}

/**
 * Incrementally build an execution by adding a new screenshot each round.
 */
function buildIncrementalExecution(
  existingScreenshots: ScreenshotItem[],
  newScreenshot: ScreenshotItem,
): ExecutionDump {
  existingScreenshots.push(newScreenshot);
  return createExecution([...existingScreenshots]);
}

function getTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `midscene-test-${prefix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function parseScriptAttributes(openTag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of openTag.matchAll(/([^\s=]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeURIComponent(match[2]);
  }
  return attributes;
}

describe('ReportGenerator — append-only model', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = getTmpDir('report-gen');
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
    it('should store repeated planning reference images once', async () => {
      const reportPath = join(tmpDir, 'reference-image-dedup.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        persistExecutionDump: true,
        autoPrint: false,
      });
      const referenceImage = fakeBase64(80_000, 'webp');
      const execution = createPlanningExecutionWithReferenceImage({
        referenceImage,
        taskCount: 20,
        id: 'reference-image-execution',
      });

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.finalize();

      const html = readFileSync(reportPath, 'utf-8');
      const imageMap = parseImageScripts(html);
      expect(Object.values(imageMap)).toContain(referenceImage);
      expect(html.split(referenceImage)).toHaveLength(2);

      const dumpScripts = extractGroupedDumpScripts(html);
      expect(dumpScripts).toHaveLength(1);
      const dump = JSON.parse(
        unescapeContent(dumpScripts[0].content),
      ) as SerializedReferenceImageDump;
      const imageRefs = referenceImageRefsFromDump(dump);
      expect(imageRefs).toHaveLength(20);
      expect(
        imageRefs.every(
          (ref) =>
            ref.type === 'midscene_image_url_ref' && ref.id === imageRefs[0].id,
        ),
      ).toBe(true);

      const restored = restoreImageReferences(
        dump,
        (ref) => imageMap[ref.id],
        (ref) => imageMap[ref.id],
      ) as unknown as RestoredReferenceImageDump;
      expect(
        restored.executions[0].tasks.every(
          (task) => task.param.userInstruction.images[0].url === referenceImage,
        ),
      ).toBe(true);
      expect(firstPlanningReferenceImageUrl(execution)).toBe(referenceImage);

      const persistedDump = readFileSync(
        join(tmpDir, '1.execution.json'),
        'utf-8',
      );
      expect(persistedDump).not.toContain(referenceImage);
      expect(persistedDump).toContain('midscene_image_url_ref');
    });

    it('should replace only registered descriptors without inspecting opaque objects', async () => {
      const reportPath = join(tmpDir, 'reference-image-descriptor-scope.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });
      const referenceImage = fakeBase64(1024, 'webp');
      const promptImage = { name: 'reference', url: referenceImage };
      const unrelatedLink = { name: 'source', url: referenceImage };
      const page = { constructor: { name: 'Page' } } as Record<string, unknown>;
      Object.defineProperty(page, 'internalState', {
        enumerable: true,
        get: () => {
          throw new Error('Page internals must remain opaque');
        },
      });
      const execution = new ExecutionDump({
        id: 'descriptor-scope',
        logTime: Date.now(),
        name: 'descriptor-scope',
        tasks: [
          {
            taskId: 'action-with-images',
            type: 'Action Space',
            param: {
              images: [promptImage],
              unrelatedLink,
              page,
            },
            executor: async () => undefined,
            recorder: [],
            status: 'finished',
          },
        ],
      });

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.finalize();

      const serializedDump = parseDumpScript(
        readFileSync(reportPath, 'utf-8'),
      )!;
      const taskParam = JSON.parse(serializedDump).executions[0].tasks[0].param;
      expect(taskParam.images[0].url).toMatchObject({
        type: 'midscene_image_url_ref',
      });
      expect(taskParam.unrelatedLink.url).toBe(referenceImage);
    });

    it('should keep report growth bounded across repeated reference-image tasks and updates', async () => {
      const referenceImage = fakeBase64(128 * 1024, 'webp');
      const finalTaskCount = 20;

      const writeReport = async (
        name: string,
        taskCounts: number[],
      ): Promise<{
        html: string;
        htmlSize: number;
        executionDump: string;
        executionDumpSize: number;
      }> => {
        const reportDir = join(tmpDir, name);
        const reportPath = join(reportDir, 'index.html');
        const generator = new ReportGenerator({
          reportPath,
          screenshotMode: 'inline',
          persistExecutionDump: true,
          autoPrint: false,
        });

        for (const taskCount of taskCounts) {
          generator.onExecutionUpdate(
            createPlanningExecutionWithReferenceImage({
              referenceImage,
              taskCount,
              id: 'bounded-reference-image-execution',
            }),
            defaultReportMeta,
          );
          await generator.flush();
        }
        await generator.finalize();

        const html = readFileSync(reportPath, 'utf-8');
        const executionDumpPath = join(reportDir, '1.execution.json');
        return {
          html,
          htmlSize: statSync(reportPath).size,
          executionDump: readFileSync(executionDumpPath, 'utf-8'),
          executionDumpSize: statSync(executionDumpPath).size,
        };
      };

      const singleTask = await writeReport('single-task', [1]);
      const finalStateOnly = await writeReport('final-state-only', [
        finalTaskCount,
      ]);
      const incremental = await writeReport(
        'incremental-updates',
        Array.from({ length: finalTaskCount }, (_, index) => index + 1),
      );

      for (const report of [singleTask, finalStateOnly, incremental]) {
        expect(report.html.split(referenceImage)).toHaveLength(2);
        expect(countGroupedDumpScripts(report.html)).toBe(1);
        expect(report.executionDump).not.toContain(referenceImage);
      }

      const referenceImageBytes = Buffer.byteLength(referenceImage);
      // Adding tasks may grow the JSON refs, but must not add even one more
      // copy of the large image payload.
      expect(finalStateOnly.htmlSize - singleTask.htmlSize).toBeLessThan(
        referenceImageBytes,
      );
      expect(
        finalStateOnly.executionDumpSize - singleTask.executionDumpSize,
      ).toBeLessThan(referenceImageBytes);

      // Finalization must compact intermediate snapshots. Allow a small amount
      // of whitespace/metadata variance, while rejecting retained dump history.
      expect(incremental.htmlSize - finalStateOnly.htmlSize).toBeLessThan(4096);
      expect(
        Math.abs(
          incremental.executionDumpSize - finalStateOnly.executionDumpSize,
        ),
      ).toBeLessThan(1024);
    });

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

    it('should not append a duplicate reference image when reusing an inline report', async () => {
      const reportPath = join(tmpDir, 'reuse-reference-image.html');
      const referenceImage = fakeBase64(64 * 1024, 'webp');

      for (const executionId of ['first-execution', 'second-execution']) {
        const generator = new ReportGenerator({
          reportPath,
          screenshotMode: 'inline',
          autoPrint: false,
          reuseExistingReport: true,
        });
        generator.onExecutionUpdate(
          createPlanningExecutionWithReferenceImage({
            referenceImage,
            taskCount: 1,
            id: executionId,
          }),
          defaultReportMeta,
        );
        await generator.finalize();
      }

      const html = readFileSync(reportPath, 'utf-8');
      expect(html.split(referenceImage)).toHaveLength(2);
      expect(
        Object.values(parseImageScripts(html)).filter(
          (imageUrl) => imageUrl === referenceImage,
        ),
      ).toHaveLength(1);
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

  describe('autoPrint — report path logging', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    const updatedLogs = () =>
      logSpy.mock.calls
        .map((args) => String(args[0]))
        .filter((msg) => msg.includes('Midscene - report file updated:'));

    it('does not log on construction, and logs "report file updated" once on first write', async () => {
      const reportPath = join(tmpDir, 'autoprint-inline.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
      });

      // Constructing the generator must not print anything yet.
      expect(updatedLogs()).toHaveLength(0);

      const execution = createExecution([
        ScreenshotItem.create(fakeBase64(100), Date.now()),
      ]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      expect(updatedLogs()).toEqual([
        `Midscene - report file updated: ${reportPath}`,
      ]);

      // Subsequent updates and finalize must not print the tip again.
      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();
      await generator.finalize();

      expect(updatedLogs()).toHaveLength(1);
    });

    it('does not log when autoPrint is disabled', async () => {
      const reportPath = join(tmpDir, 'autoprint-disabled.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      generator.onExecutionUpdate(
        createExecution([ScreenshotItem.create(fakeBase64(100), Date.now())]),
        defaultReportMeta,
      );
      await generator.flush();
      await generator.finalize();

      expect(updatedLogs()).toHaveLength(0);
    });

    it('points at "npx serve <dir>" in directory mode', async () => {
      const reportDir = join(tmpDir, 'autoprint-dir');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
      });

      generator.onExecutionUpdate(
        createExecution([ScreenshotItem.create(fakeBase64(100), Date.now())]),
        defaultReportMeta,
      );
      await generator.flush();

      expect(updatedLogs()).toEqual([
        `Midscene - report file updated: npx serve ${reportDir}`,
      ]);
    });
  });

  describe('directory mode — incremental PNG writes', () => {
    it('should write each screenshot as a PNG file exactly once', async () => {
      const reportDir = join(tmpDir, 'dir-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const allScreenshots: ScreenshotItem[] = [];
      const rounds = 5;

      for (let i = 0; i < rounds; i++) {
        const newScreenshot = ScreenshotItem.create(
          fakeBase64(500),
          Date.now(),
        );
        const execution = buildIncrementalExecution(
          allScreenshots,
          newScreenshot,
        );
        generator.onExecutionUpdate(execution, defaultReportMeta);
      }
      await generator.flush();

      const screenshotsDir = join(reportDir, 'screenshots');
      expect(existsSync(screenshotsDir)).toBe(true);

      const pngFiles = readdirSync(screenshotsDir).filter((f) =>
        f.endsWith('.png'),
      );
      expect(pngFiles).toHaveLength(rounds);

      for (const s of allScreenshots) {
        expect(existsSync(join(screenshotsDir, `${s.id}.png`))).toBe(true);
      }
    });

    it('should write JPEG screenshots with .jpeg extension', async () => {
      const reportDir = join(tmpDir, 'dir-jpeg-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const jpegScreenshot = ScreenshotItem.create(
        fakeBase64(500, 'jpeg'),
        Date.now(),
      );
      const pngScreenshot = ScreenshotItem.create(
        fakeBase64(500, 'png'),
        Date.now(),
      );
      const execution = createExecution([jpegScreenshot, pngScreenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      const screenshotsDir = join(reportDir, 'screenshots');
      expect(
        existsSync(join(screenshotsDir, `${jpegScreenshot.id}.jpeg`)),
      ).toBe(true);
      expect(existsSync(join(screenshotsDir, `${pngScreenshot.id}.png`))).toBe(
        true,
      );
    });

    it('should not re-write existing PNG files on subsequent updates', async () => {
      const reportDir = join(tmpDir, 'no-rewrite-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(500), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();
      const screenshotsDir = join(reportDir, 'screenshots');
      const pngPath = join(screenshotsDir, `${screenshot.id}.png`);
      const mtimeFirst = statSync(pngPath).mtimeMs;

      const startTime = Date.now();
      while (Date.now() - startTime < 50) {
        // busy wait
      }

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();
      const mtimeSecond = statSync(pngPath).mtimeMs;

      expect(mtimeSecond).toBe(mtimeFirst);
    });

    it('should append dump tags on each update in directory mode', async () => {
      const reportDir = join(tmpDir, 'html-append-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        persistExecutionDump: true,
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      for (let i = 0; i < 4; i++) {
        generator.onExecutionUpdate(execution, defaultReportMeta);
      }
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      // Should have 5 dump tags total (1 + 4 updates)
      expect(countGroupedDumpScripts(html)).toBe(5);

      const jsonFiles = readdirSync(reportDir)
        .filter((name) => /^\d+\.execution\.json$/.test(name))
        .sort();
      expect(jsonFiles).toEqual(['1.execution.json']);
      expect(
        existsSync(join(reportDir, 'screenshots', `${screenshot.id}.png`)),
      ).toBe(true);

      await generator.finalize();
      const finalizedHtml = readFileSync(reportPath, 'utf-8');
      expect(countGroupedDumpScripts(finalizedHtml)).toBe(1);
      expect(
        existsSync(join(reportDir, 'screenshots', `${screenshot.id}.png`)),
      ).toBe(true);
    });

    it('should write merged attributes in directory mode', async () => {
      const reportDir = join(tmpDir, 'dir-attribute-merge');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta, {
        playwright_test_title: 'first title',
      });
      await generator.flush();

      generator.onExecutionUpdate(execution, defaultReportMeta, {
        playwright_test_title: 'final title',
        playwright_test_duration: 456,
      });
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      const dumpScripts = extractGroupedDumpScripts(html);
      expect(dumpScripts).toHaveLength(2);

      const secondAttrs = parseScriptAttributes(dumpScripts[1].openTag);
      expect(secondAttrs.playwright_test_title).toBe('final title');
      expect(secondAttrs.playwright_test_duration).toBe('456');
    });

    it('should produce valid HTML structure in directory mode', async () => {
      const reportDir = join(tmpDir, 'dir-snapshot-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const screenshot1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const screenshot2 = ScreenshotItem.create(fakeBase64(200), Date.now());
      const execution = createExecution([screenshot1, screenshot2]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      expect(html).toContain('Midscene');

      const dumpContent = parseDumpScript(html);
      expect(dumpContent).toBeTruthy();
      const parsed = JSON.parse(dumpContent);
      expect(parsed.groupName).toBe('test-group');
      expect(parsed.executions).toHaveLength(1);
      expect(parsed.executions[0].tasks).toHaveLength(2);
    });

    it('should output screenshot references as path format in dump JSON (directory mode)', async () => {
      const reportDir = join(tmpDir, 'dir-path-format-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const screenshotId = screenshot.id;
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      const dumpContent = parseDumpScript(html);
      expect(dumpContent).toBeTruthy();

      const dumpObj = JSON.parse(dumpContent!.trim());

      const screenshotRef = dumpObj.executions[0].tasks[0].uiContext.screenshot;
      expect(screenshotRef).toMatchObject({
        type: 'midscene_screenshot_ref',
        storage: 'file',
      });
      expect(screenshotRef.path).toContain('screenshots');
      expect(screenshotRef.path).toContain(screenshotId);
    });

    it('should externalize repeated planning reference images once in directory mode', async () => {
      const reportDir = join(tmpDir, 'dir-reference-image-dedup');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });
      const referenceImage = fakeBase64(128 * 1024, 'jpeg');
      const execution = createPlanningExecutionWithReferenceImage({
        referenceImage,
        taskCount: 50,
        id: 'directory-reference-image-execution',
      });

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.finalize();

      const screenshotFiles = readdirSync(join(reportDir, 'screenshots'));
      expect(screenshotFiles).toHaveLength(1);
      expect(screenshotFiles[0]).toMatch(/\.jpeg$/);

      const serializedDump = parseDumpScript(
        readFileSync(reportPath, 'utf-8'),
      )!;
      expect(serializedDump).not.toContain(referenceImage);
      expect(Buffer.byteLength(serializedDump)).toBeLessThan(
        Buffer.byteLength(referenceImage),
      );

      const dump = JSON.parse(serializedDump) as SerializedReferenceImageDump;
      const imageRefs = referenceImageRefsFromDump(dump);
      expect(imageRefs).toHaveLength(50);
      expect(
        imageRefs.every(
          (ref) =>
            ref.type === 'midscene_image_url_ref' &&
            ref.storage === 'file' &&
            ref.path === imageRefs[0].path,
        ),
      ).toBe(true);
    });

    it('should release memory after writing and recover via lazy loading (directory mode)', async () => {
      const reportDir = join(tmpDir, 'dir-memory-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultReportMeta);
      await generator.flush();

      // In directory mode, screenshots are always persisted immediately
      expect(screenshot.hasBase64()).toBe(false);

      expect(() => screenshot.base64).not.toThrow();
      const recoveredBase64 = screenshot.base64;
      expect(recoveredBase64).toContain('data:image/png;base64,');

      const serialized = screenshot.toSerializable();
      expect(serialized).toMatchObject({
        type: 'midscene_screenshot_ref',
        storage: 'file',
      });
      expect((serialized as { path: string }).path).toContain('screenshots');
    });

    it('should produce dump tags for multiple executions in directory mode', async () => {
      const reportDir = join(tmpDir, 'dir-multi-exec-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const s1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const s2 = ScreenshotItem.create(fakeBase64(100), Date.now());

      const exec1 = createExecution([s1], 'exec-1');
      generator.onExecutionUpdate(exec1, defaultReportMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'exec-2');
      generator.onExecutionUpdate(exec2, defaultReportMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      expect(countGroupedDumpScripts(html)).toBe(2);
    });

    it('should produce separate dump tags for same-name executions in directory mode', async () => {
      const reportDir = join(tmpDir, 'dir-same-name-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const s1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const s2 = ScreenshotItem.create(fakeBase64(100), Date.now());

      const exec1 = createExecution([s1], 'Act - click login', 'dir-id-1');
      generator.onExecutionUpdate(exec1, defaultReportMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'Act - click login', 'dir-id-2');
      generator.onExecutionUpdate(exec2, defaultReportMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      expect(countGroupedDumpScripts(html)).toBe(2);
    });
  });

  describe('nullReportGenerator — no-op', () => {
    it('should do nothing on onExecutionUpdate and finalize', async () => {
      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot]);

      nullReportGenerator.onExecutionUpdate(execution, defaultReportMeta);
      const result = await nullReportGenerator.finalize();

      expect(result).toBeUndefined();
      expect(nullReportGenerator.getReportPath()).toBeUndefined();
    });
  });

  describe('ReportGenerator.create factory', () => {
    it('should return nullReportGenerator when generateReport is false', () => {
      const gen = ReportGenerator.create('test', {
        generateReport: false,
      });
      expect(gen).toBe(nullReportGenerator);
    });

    it('should reject empty reportFileName when generateReport is false', () => {
      expect(() =>
        ReportGenerator.create('', {
          generateReport: false,
        }),
      ).toThrow('reportFileName must be a non-empty string');
    });

    it('should throw when persistExecutionDump is true and generateReport is false', () => {
      expect(() =>
        ReportGenerator.create('test-invalid', {
          generateReport: false,
          persistExecutionDump: true,
        }),
      ).toThrow(
        'persistExecutionDump cannot be true when generateReport is false',
      );
    });

    it('should create inline mode generator by default', () => {
      const gen = ReportGenerator.create('test-inline', {});
      expect(gen).toBeInstanceOf(ReportGenerator);
      const reportPath = gen.getReportPath();
      expect(reportPath).toContain('test-inline.html');
      expect(reportPath).not.toContain('index.html');
    });

    it('should preserve .html extension for inline mode generator', () => {
      const gen = ReportGenerator.create('already-html.html', {});
      expect(gen).toBeInstanceOf(ReportGenerator);
      const reportPath = gen.getReportPath();
      expect(reportPath).toContain('already-html.html');
      expect(reportPath).not.toContain('already-html.html.html');
    });

    it('should create directory mode generator when outputFormat is html-and-external-assets', () => {
      const gen = ReportGenerator.create('test-dir', {
        outputFormat: 'html-and-external-assets',
      });
      expect(gen).toBeInstanceOf(ReportGenerator);
      const reportPath = gen.getReportPath();
      expect(reportPath).toContain('test-dir');
      expect(reportPath).toContain('index.html');
    });

    it('should disable execution dump persistence by default', async () => {
      const gen = ReportGenerator.create('test-default-no-exec-dump', {
        autoPrintReportMsg: false,
      }) as ReportGenerator;

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution(
        [screenshot],
        'factory-default-no-exec-dump',
      );

      gen.onExecutionUpdate(execution, defaultReportMeta);
      await gen.flush();

      const reportDir = dirname(gen.getReportPath()!);
      const rootFiles = readdirSync(reportDir).filter((name) =>
        /^\d+\.execution\.json(?:\.screenshots)?$/.test(name),
      );
      expect(rootFiles).toEqual([]);
    });

    it('should create generator with execution dump persistence disabled', async () => {
      const gen = ReportGenerator.create('test-no-exec-dump', {
        persistExecutionDump: false,
        autoPrintReportMsg: false,
      }) as ReportGenerator;

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot], 'factory-no-exec-dump');

      gen.onExecutionUpdate(execution, defaultReportMeta);
      await gen.flush();

      const reportDir = dirname(gen.getReportPath()!);
      const rootFiles = readdirSync(reportDir).filter((name) =>
        /^\d+\.execution\.json(?:\.screenshots)?$/.test(name),
      );
      expect(rootFiles).toEqual([]);
    });

    it('should throw for reportFileName with path separators', () => {
      expect(() => ReportGenerator.create('../bad-name', {})).toThrow(
        'reportFileName must not contain path separators',
      );
      expect(() => ReportGenerator.create('bad/name', {})).toThrow(
        'reportFileName must not contain path separators',
      );
    });

    it('should throw for reportFileName with illegal filename characters', () => {
      expect(() => ReportGenerator.create('bad:name', {})).toThrow(
        'reportFileName contains illegal filename characters',
      );
      expect(() => ReportGenerator.create('bad*name', {})).toThrow(
        'reportFileName contains illegal filename characters',
      );
    });

    it('should validate single-html report names by their final UTF-8 byte length', () => {
      expect(() =>
        ReportGenerator.create('中'.repeat(83), { generateReport: false }),
      ).not.toThrow();
      expect(() =>
        ReportGenerator.create('中'.repeat(84), { generateReport: false }),
      ).toThrow(
        'reportFileName produces a filename component of 257 UTF-8 bytes; maximum is 255',
      );
    });

    it('should validate directory report names without reserving an HTML extension', () => {
      expect(() =>
        ReportGenerator.create('中'.repeat(85), {
          generateReport: false,
          outputFormat: 'html-and-external-assets',
        }),
      ).not.toThrow();
      expect(() =>
        ReportGenerator.create('中'.repeat(86), {
          generateReport: false,
          outputFormat: 'html-and-external-assets',
        }),
      ).toThrow(
        'reportFileName produces a filename component of 258 UTF-8 bytes; maximum is 255',
      );
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
