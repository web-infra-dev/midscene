import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseDumpScript,
  parseImageScripts,
  unescapeContent,
} from '@/dump/html-utils';
import { ReportGenerator, nullReportGenerator } from '@/report-generator';
import { ScreenshotItem } from '@/screenshot-item';
import {
  ExecutionDump,
  type GroupMeta,
  GroupedActionDump,
  type UIContext,
} from '@/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Create a fake base64 string of a specified size (in bytes).
 * Uses repeating 'A' characters (valid base64).
 */
function fakeBase64(sizeBytes: number, format: 'png' | 'jpeg' = 'png'): string {
  return `data:image/${format};base64,${'A'.repeat(sizeBytes)}`;
}

const defaultGroupMeta: GroupMeta = {
  groupName: 'test-group',
  groupDescription: 'test',
  sdkVersion: '1.0.0-test',
  modelBriefs: [],
};

/**
 * Create an ExecutionDump with the given screenshots in uiContext.
 */
function createExecution(
  screenshots: ScreenshotItem[],
  name = 'test-execution',
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
    logTime: Date.now(),
    name,
    tasks,
  });
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

/**
 * Count dump script tags that are user-generated (have data-group-id),
 * excluding any that are part of the report template.
 */
function countUserDumpTags(html: string): number {
  const regex = /<script type="midscene_web_dump"[^>]*data-group-id[^>]*>/g;
  return (html.match(regex) || []).length;
}

function getTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `midscene-test-${prefix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('ReportGenerator — per-execution append model', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = getTmpDir('report-gen');
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('inline mode — truncate+append strategy', () => {
    it('should write each screenshot image tag exactly once across multiple updates', async () => {
      const reportPath = join(tmpDir, 'inline-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
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
        generator.onExecutionUpdate(execution, defaultGroupMeta);
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
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(500), Date.now());
      const execution = createExecution([screenshot]);

      for (let i = 0; i < 10; i++) {
        generator.onExecutionUpdate(execution, defaultGroupMeta);
      }
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      const imageMap = parseImageScripts(html);

      expect(imageMap[screenshot.id]).toBeDefined();
      expect(imageMap[screenshot.id]).toContain('AAAA');
    });

    it('should replace dump JSON on each update, not accumulate', async () => {
      const reportPath = join(tmpDir, 'truncate-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();
      const sizeAfterFirst = statSync(reportPath).size;

      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();
      const sizeAfterSecond = statSync(reportPath).size;

      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();
      const sizeAfterThird = statSync(reportPath).size;

      // File size should remain stable (truncate + re-write same content)
      expect(sizeAfterSecond).toBe(sizeAfterFirst);
      expect(sizeAfterThird).toBe(sizeAfterFirst);
    });

    it('should grow file size linearly with new screenshots, not quadratically', async () => {
      const reportPath = join(tmpDir, 'linear-growth-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const allScreenshots: ScreenshotItem[] = [];
      const screenshotSize = 2000;
      const rounds = 10;
      const sizes: number[] = [];

      for (let i = 0; i < rounds; i++) {
        const newScreenshot = ScreenshotItem.create(
          fakeBase64(screenshotSize),
          Date.now(),
        );
        const execution = buildIncrementalExecution(
          allScreenshots,
          newScreenshot,
        );
        generator.onExecutionUpdate(execution, defaultGroupMeta);
        await generator.flush();
        sizes.push(statSync(reportPath).size);
      }

      const increments = [];
      for (let i = 1; i < sizes.length; i++) {
        increments.push(sizes[i] - sizes[i - 1]);
      }

      const minIncrement = Math.min(...increments);
      const maxIncrement = Math.max(...increments);
      expect(maxIncrement).toBeLessThan(minIncrement * 3);
    });

    it('should produce valid HTML with parseable image map and dump JSON', async () => {
      const reportPath = join(tmpDir, 'valid-html-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const screenshot1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const screenshot2 = ScreenshotItem.create(fakeBase64(200), Date.now());

      // Round 1: one screenshot
      const exec1 = createExecution([screenshot1]);
      generator.onExecutionUpdate(exec1, defaultGroupMeta);

      // Round 2: two screenshots (same execution name = update)
      const exec2 = createExecution([screenshot1, screenshot2]);
      generator.onExecutionUpdate(exec2, defaultGroupMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      expect(html).toContain('Midscene');

      const imageMap = parseImageScripts(html);
      expect(imageMap[screenshot1.id]).toBeDefined();
      expect(imageMap[screenshot2.id]).toBeDefined();

      // Should have exactly 1 user dump tag with data-group-id
      expect(countUserDumpTags(html)).toBe(1);

      // Parse the user dump tag
      const dumpRegex =
        /<script type="midscene_web_dump"[^>]*data-group-id[^>]*>([\s\S]*?)<\/script>/g;
      const dumpMatches = [...html.matchAll(dumpRegex)];
      expect(dumpMatches.length).toBe(1);

      const dumpJson = unescapeContent(dumpMatches[0][1]);
      const parsed = JSON.parse(dumpJson);
      expect(parsed.groupName).toBe('test-group');
      expect(parsed.executions).toHaveLength(1);
      expect(parsed.executions[0].tasks).toHaveLength(2);
    });

    it('should produce multiple dump tags for multiple executions with data-group-id', async () => {
      const reportPath = join(tmpDir, 'multi-exec-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const s1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const s2 = ScreenshotItem.create(fakeBase64(100), Date.now());

      // Write two different executions
      const exec1 = createExecution([s1], 'exec-1');
      generator.onExecutionUpdate(exec1, defaultGroupMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'exec-2');
      generator.onExecutionUpdate(exec2, defaultGroupMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      // Should have 2 user dump tags with data-group-id
      expect(countUserDumpTags(html)).toBe(2);

      // Each dump tag should contain exactly 1 execution
      const dumpRegex =
        /<script type="midscene_web_dump"[^>]*data-group-id[^>]*>([\s\S]*?)<\/script>/g;
      for (const match of html.matchAll(dumpRegex)) {
        const dumpJson = unescapeContent(match[1]);
        const parsed = JSON.parse(dumpJson);
        expect(parsed.executions).toHaveLength(1);
      }
    });
  });

  describe('directory mode — incremental PNG writes', () => {
    it('should write each screenshot as a PNG file exactly once', async () => {
      const reportDir = join(tmpDir, 'dir-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
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
        generator.onExecutionUpdate(execution, defaultGroupMeta);
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

      generator.onExecutionUpdate(execution, defaultGroupMeta);
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
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(500), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();
      const screenshotsDir = join(reportDir, 'screenshots');
      const pngPath = join(screenshotsDir, `${screenshot.id}.png`);
      const mtimeFirst = statSync(pngPath).mtimeMs;

      const startTime = Date.now();
      while (Date.now() - startTime < 50) {
        // busy wait
      }

      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();
      const mtimeSecond = statSync(pngPath).mtimeMs;

      expect(mtimeSecond).toBe(mtimeFirst);
    });

    it('should overwrite HTML file on each update (not append)', async () => {
      const reportDir = join(tmpDir, 'html-overwrite-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();
      const sizeAfterFirst = statSync(reportPath).size;

      for (let i = 0; i < 4; i++) {
        generator.onExecutionUpdate(execution, defaultGroupMeta);
      }
      await generator.flush();
      const sizeAfterFifth = statSync(reportPath).size;

      expect(sizeAfterFifth).toBe(sizeAfterFirst);
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

      generator.onExecutionUpdate(execution, defaultGroupMeta);
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

      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      const dumpContent = parseDumpScript(html);
      expect(dumpContent).toBeTruthy();

      const dumpObj = JSON.parse(dumpContent!.trim());

      const screenshotRef = dumpObj.executions[0].tasks[0].uiContext.screenshot;
      expect(screenshotRef).toHaveProperty('base64');
      expect(screenshotRef.base64).toContain('screenshots');
      expect(screenshotRef.base64).toContain(screenshotId);
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

      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();

      // In directory mode, screenshots are always persisted immediately
      expect(screenshot.hasBase64()).toBe(false);

      expect(() => screenshot.base64).not.toThrow();
      const recoveredBase64 = screenshot.base64;
      expect(recoveredBase64).toContain('data:image/png;base64,');

      const serialized = screenshot.toSerializable();
      expect(serialized).toHaveProperty('base64');
      expect((serialized as { base64: string }).base64).toContain(
        'screenshots',
      );
    });

    it('should produce multiple dump tags for multiple executions in directory mode', async () => {
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
      generator.onExecutionUpdate(exec1, defaultGroupMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'exec-2');
      generator.onExecutionUpdate(exec2, defaultGroupMeta);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      expect(countUserDumpTags(html)).toBe(2);
    });
  });

  describe('nullReportGenerator — no-op', () => {
    it('should do nothing on onExecutionUpdate and finalize', async () => {
      const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
      const execution = createExecution([screenshot]);

      nullReportGenerator.onExecutionUpdate(execution, defaultGroupMeta);
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

    it('should create inline mode generator by default', () => {
      const gen = ReportGenerator.create('test-inline', {});
      expect(gen).toBeInstanceOf(ReportGenerator);
      const reportPath = gen.getReportPath();
      expect(reportPath).toContain('test-inline.html');
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
  });

  describe('lazy loading — memory release behavior', () => {
    it('should release memory immediately in inline mode for active execution screenshots', async () => {
      // Note: In the per-execution model, active execution screenshots are NOT released
      // because the active region may be truncated and re-written.
      // Screenshots are only released when the execution transitions to frozen
      // (i.e., when a new execution starts).
      const reportPath = join(tmpDir, 'inline-active-memory.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(10000), Date.now());
      const execution = createExecution([screenshot]);

      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();

      // Active execution screenshots remain in memory (not released)
      expect(screenshot.hasBase64()).toBe(true);

      // Start a new execution to freeze the first one
      const s2 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const exec2 = createExecution([s2], 'exec-2');
      generator.onExecutionUpdate(exec2, defaultGroupMeta);
      await generator.flush();

      // Now the first execution is frozen, screenshot memory should be released
      expect(screenshot.hasBase64()).toBe(false);

      // But it should be recoverable via lazy loading
      expect(() => screenshot.base64).not.toThrow();
      const recoveredBase64 = screenshot.base64;
      expect(recoveredBase64).toContain('data:image/png;base64,');
      expect(recoveredBase64).toContain('AAAA');
    });

    it('should release all screenshots when multiple executions transition to frozen', async () => {
      const reportPath = join(tmpDir, 'multi-exec-release.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
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
        generator.onExecutionUpdate(execution, defaultGroupMeta);
        await generator.flush();
      }

      // Only the last (active) execution's screenshots should still be in memory
      // Frozen executions (0 and 1) should be released
      for (const s of screenshots[0]) {
        expect(s.hasBase64()).toBe(false);
      }
      for (const s of screenshots[1]) {
        expect(s.hasBase64()).toBe(false);
      }
      // Active execution screenshots stay in memory
      for (const s of screenshots[2]) {
        expect(s.hasBase64()).toBe(true);
      }

      // All frozen screenshots should be recoverable
      for (const s of screenshots[0]) {
        expect(() => s.base64).not.toThrow();
        expect(s.base64).toContain('data:image/png;base64,');
      }
      for (const s of screenshots[1]) {
        expect(() => s.base64).not.toThrow();
      }
    });

    it('should handle finalize() correctly', async () => {
      const reportPath = join(tmpDir, 'finalize-lazy.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const s1 = ScreenshotItem.create(fakeBase64(1000), Date.now());
      const s2 = ScreenshotItem.create(fakeBase64(1000), Date.now());

      const exec1 = createExecution([s1], 'execution-0');
      generator.onExecutionUpdate(exec1, defaultGroupMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'execution-1');
      generator.onExecutionUpdate(exec2, defaultGroupMeta);
      await generator.flush();

      // s1 is frozen (released), s2 is active (in memory)
      expect(s1.hasBase64()).toBe(false);
      expect(s2.hasBase64()).toBe(true);

      // After finalize: both should be recoverable
      await generator.finalize();
      expect(() => s1.base64).not.toThrow();
      expect(() => s2.base64).not.toThrow();
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
      generator.onExecutionUpdate(exec1, defaultGroupMeta);
      await generator.flush();

      const exec2 = createExecution([s2], 'execution-1');
      generator.onExecutionUpdate(exec2, defaultGroupMeta);
      await generator.flush();

      // In directory mode, all screenshots are persisted immediately
      for (const s of [s1, s2]) {
        expect(s.hasBase64()).toBe(false);
        const serialized = s.toSerializable();
        expect(serialized).toHaveProperty('base64');
        expect((serialized as { base64: string }).base64).toContain(
          'screenshots',
        );
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
        autoPrint: false,
      });

      const screenshot1 = ScreenshotItem.create(fakeBase64(100), Date.now());
      const screenshot2 = ScreenshotItem.create(fakeBase64(200), Date.now());
      const screenshot3 = ScreenshotItem.create(fakeBase64(300), Date.now());

      // Write as first execution, then start a new one to freeze
      const execution = createExecution(
        [screenshot1, screenshot2, screenshot3],
        'exec-1',
      );
      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();

      // Start new execution to freeze the first one
      const dummyExec = createExecution([], 'exec-2');
      generator.onExecutionUpdate(dummyExec, defaultGroupMeta);
      await generator.flush();

      // All released (frozen)
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

  describe('memory efficiency — frozenScreenshots tracking', () => {
    it('frozenScreenshots Set should contain only IDs, not base64 data', async () => {
      const reportPath = join(tmpDir, 'tracking-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const largeScreenshot = ScreenshotItem.create(
        fakeBase64(100_000),
        Date.now(),
      );
      const execution = createExecution([largeScreenshot], 'exec-1');
      generator.onExecutionUpdate(execution, defaultGroupMeta);
      await generator.flush();

      // Freeze by starting new execution
      const dummyExec = createExecution([], 'exec-2');
      generator.onExecutionUpdate(dummyExec, defaultGroupMeta);
      await generator.flush();

      const frozenScreenshots = (generator as any)
        .frozenScreenshots as Set<string>;
      expect(frozenScreenshots.size).toBe(1);

      const storedValue = [...frozenScreenshots][0];
      expect(storedValue).toBe(largeScreenshot.id);
      expect(storedValue.length).toBeLessThan(100);
    });

    it('should handle many screenshots without unbounded internal state growth', async () => {
      const reportPath = join(tmpDir, 'many-screenshots-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const allScreenshots: ScreenshotItem[] = [];
      const totalScreenshots = 50;

      for (let i = 0; i < totalScreenshots; i++) {
        const newScreenshot = ScreenshotItem.create(
          fakeBase64(1000),
          Date.now(),
        );
        const execution = buildIncrementalExecution(
          allScreenshots,
          newScreenshot,
        );
        generator.onExecutionUpdate(execution, defaultGroupMeta);
      }
      await generator.flush();

      // activeExecStartOffset should be tracked correctly
      const activeExecStartOffset = (generator as any)
        .activeExecStartOffset as number;
      const fileSize = statSync(reportPath).size;

      expect(activeExecStartOffset).toBeLessThan(fileSize);
      expect(activeExecStartOffset).toBeGreaterThan(0);
    });
  });
});
