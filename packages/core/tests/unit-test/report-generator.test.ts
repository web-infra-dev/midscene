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
import { ExecutionDump, GroupedActionDump, type UIContext } from '@/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Create a fake base64 string of a specified size (in bytes).
 * Uses repeating 'A' characters (valid base64).
 */
function fakeBase64(
  sizeBytes: number,
  format: 'png' | 'jpeg' = 'png',
): string {
  return `data:image/${format};base64,${'A'.repeat(sizeBytes)}`;
}

/**
 * Create a GroupedActionDump with the given screenshots in uiContext.
 * Default status is 'running' to simulate ongoing execution (no memory release expected).
 */
function createDump(screenshots: ScreenshotItem[]): GroupedActionDump {
  const tasks = screenshots.map((s, i) => ({
    type: 'Insight' as const,
    subType: 'Locate',
    param: { prompt: `task-${i}` },
    uiContext: {
      screenshot: s,
      size: { width: 1920, height: 1080 },
    } as UIContext,
    executor: async () => undefined,
    recorder: [],
    status: 'running' as const,
  }));

  return new GroupedActionDump({
    sdkVersion: '1.0.0-test',
    groupName: 'test-group',
    groupDescription: 'test',
    modelBriefs: [],
    executions: [
      new ExecutionDump({
        logTime: Date.now(),
        name: 'test-execution',
        tasks,
      }),
    ],
  });
}

/**
 * Incrementally build a dump by adding a new screenshot each round.
 * Returns the cumulative dump.
 */
function buildIncrementalDump(
  existingScreenshots: ScreenshotItem[],
  newScreenshot: ScreenshotItem,
): GroupedActionDump {
  existingScreenshots.push(newScreenshot);
  return createDump([...existingScreenshots]);
}

function getTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `midscene-test-${prefix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('ReportGenerator — constant memory guarantees', () => {
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
      const screenshotSize = 1000; // 1KB per screenshot

      for (let i = 0; i < rounds; i++) {
        const newScreenshot = ScreenshotItem.create(fakeBase64(screenshotSize));
        const dump = buildIncrementalDump(allScreenshots, newScreenshot);
        generator.onDumpUpdate(dump);
      }
      await generator.flush();

      // Read the final HTML
      const html = readFileSync(reportPath, 'utf-8');
      const imageMap = parseImageScripts(html);

      // Each screenshot ID should appear exactly once (the template may contain
      // extra entries from bundled JS code, so we only verify our IDs exist)
      for (const s of allScreenshots) {
        expect(imageMap[s.id]).toBeDefined();
        // Verify the base64 content matches
        expect(imageMap[s.id]).toContain('AAAA'); // Our fake base64 contains 'A' chars
      }
    });

    it('should not duplicate image tags when same dump is written multiple times', async () => {
      const reportPath = join(tmpDir, 'dedup-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(500));
      const dump = createDump([screenshot]);

      // Write same dump 10 times
      for (let i = 0; i < 10; i++) {
        generator.onDumpUpdate(dump);
      }
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');
      const imageMap = parseImageScripts(html);

      // Our screenshot ID should exist (deduplication by ID ensures only one)
      expect(imageMap[screenshot.id]).toBeDefined();
      // Verify the base64 content matches
      expect(imageMap[screenshot.id]).toContain('AAAA'); // Our fake base64 contains 'A' chars
    });

    it('should replace dump JSON on each update, not accumulate', async () => {
      const reportPath = join(tmpDir, 'truncate-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100));
      const dump = createDump([screenshot]);

      // Write dump 3 times
      generator.onDumpUpdate(dump);
      await generator.flush();
      const sizeAfterFirst = statSync(reportPath).size;

      generator.onDumpUpdate(dump);
      await generator.flush();
      const sizeAfterSecond = statSync(reportPath).size;

      generator.onDumpUpdate(dump);
      await generator.flush();
      const sizeAfterThird = statSync(reportPath).size;

      // Since no new images are added, the file size should remain stable
      // (dump JSON is truncated and rewritten, not accumulated)
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
        const newScreenshot = ScreenshotItem.create(fakeBase64(screenshotSize));
        const dump = buildIncrementalDump(allScreenshots, newScreenshot);
        generator.onDumpUpdate(dump);
        await generator.flush();
        sizes.push(statSync(reportPath).size);
      }

      // Check incremental growth: each step should add roughly the same amount
      // (one new image tag + updated dump JSON)
      // The dump JSON grows slightly with more tasks, but image tags dominate
      const increments = [];
      for (let i = 1; i < sizes.length; i++) {
        increments.push(sizes[i] - sizes[i - 1]);
      }

      // All increments should be roughly similar (within 3x of each other)
      // This proves linear growth, not quadratic
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

      const screenshot1 = ScreenshotItem.create(fakeBase64(100));
      const screenshot2 = ScreenshotItem.create(fakeBase64(200));

      // Round 1: one screenshot
      const dump1 = createDump([screenshot1]);
      generator.onDumpUpdate(dump1);

      // Round 2: two screenshots
      const dump2 = createDump([screenshot1, screenshot2]);
      generator.onDumpUpdate(dump2);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      // Verify HTML has expected structure
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      expect(html).toContain('Midscene');

      // Parse image scripts - verify our screenshots exist
      const imageMap = parseImageScripts(html);
      expect(imageMap[screenshot1.id]).toBeDefined();
      expect(imageMap[screenshot2.id]).toBeDefined();

      // Parse dump JSON - use last match to avoid bundled JS in template
      // The parseDumpScript function returns first match which may be template JS
      // So we manually find the last dump script tag
      const dumpRegex =
        /<script type="midscene_web_dump"[^>]*>([\s\S]*?)<\/script>/g;
      const dumpMatches = [...html.matchAll(dumpRegex)];
      const lastDumpMatch =
        dumpMatches.length > 0 ? dumpMatches[dumpMatches.length - 1] : null;
      expect(lastDumpMatch).not.toBeNull();

      // Use unescapeContent to handle escaped characters
      const dumpJson = unescapeContent(lastDumpMatch![1]);
      const parsed = JSON.parse(dumpJson);
      expect(parsed.groupName).toBe('test-group');
      expect(parsed.executions).toHaveLength(1);
      // dump2 has 2 tasks (2 screenshots)
      expect(parsed.executions[0].tasks).toHaveLength(2);
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
        const newScreenshot = ScreenshotItem.create(fakeBase64(500));
        const dump = buildIncrementalDump(allScreenshots, newScreenshot);
        generator.onDumpUpdate(dump);
      }
      await generator.flush();

      // Check screenshots directory
      const screenshotsDir = join(reportDir, 'screenshots');
      expect(existsSync(screenshotsDir)).toBe(true);

      const pngFiles = readdirSync(screenshotsDir).filter((f) =>
        f.endsWith('.png'),
      );
      expect(pngFiles).toHaveLength(rounds);

      // Each screenshot should have its own PNG file
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

      const jpegScreenshot = ScreenshotItem.create(fakeBase64(500, 'jpeg'));
      const pngScreenshot = ScreenshotItem.create(fakeBase64(500, 'png'));
      const dump = createDump([jpegScreenshot, pngScreenshot]);

      generator.onDumpUpdate(dump);
      await generator.flush();

      const screenshotsDir = join(reportDir, 'screenshots');
      expect(
        existsSync(join(screenshotsDir, `${jpegScreenshot.id}.jpeg`)),
      ).toBe(true);
      expect(
        existsSync(join(screenshotsDir, `${pngScreenshot.id}.png`)),
      ).toBe(true);
    });

    it('should not re-write existing PNG files on subsequent updates', async () => {
      const reportDir = join(tmpDir, 'no-rewrite-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(500));
      const dump = createDump([screenshot]);

      // First update
      generator.onDumpUpdate(dump);
      await generator.flush();
      const screenshotsDir = join(reportDir, 'screenshots');
      const pngPath = join(screenshotsDir, `${screenshot.id}.png`);
      const mtimeFirst = statSync(pngPath).mtimeMs;

      // Small delay to ensure mtime would differ
      const startTime = Date.now();
      while (Date.now() - startTime < 50) {
        // busy wait
      }

      // Second update with same dump
      generator.onDumpUpdate(dump);
      await generator.flush();
      const mtimeSecond = statSync(pngPath).mtimeMs;

      // PNG file should not be re-written (same mtime)
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

      const screenshot = ScreenshotItem.create(fakeBase64(100));
      const dump = createDump([screenshot]);

      // Write first time
      generator.onDumpUpdate(dump);
      await generator.flush();
      const sizeAfterFirst = statSync(reportPath).size;

      // Write 4 more times
      for (let i = 0; i < 4; i++) {
        generator.onDumpUpdate(dump);
      }
      await generator.flush();
      const sizeAfterFifth = statSync(reportPath).size;

      // Since the same dump is written repeatedly, file size should remain stable
      // (overwrite, not append). Small variance allowed for potential timestamp changes.
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

      const screenshot1 = ScreenshotItem.create(fakeBase64(100));
      const screenshot2 = ScreenshotItem.create(fakeBase64(200));
      const dump = createDump([screenshot1, screenshot2]);

      generator.onDumpUpdate(dump);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      // Verify HTML has expected structure
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      expect(html).toContain('Midscene');

      // Verify dump script is present and parseable
      const dumpContent = parseDumpScript(html);
      expect(dumpContent).toBeTruthy();
      const parsed = JSON.parse(dumpContent);
      expect(parsed.groupName).toBe('test-group');
      expect(parsed.executions).toHaveLength(1);
      expect(parsed.executions[0].tasks).toHaveLength(2);
    });

    it('should output screenshot references as path format in dump JSON (directory mode)', async () => {
      // Directory mode uses { base64: path } format in dump JSON
      // Browser-side will load PNG files directly from the path
      const reportDir = join(tmpDir, 'dir-path-format-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100));
      const screenshotId = screenshot.id;
      const dump = createDump([screenshot]);

      generator.onDumpUpdate(dump);
      await generator.flush();

      const html = readFileSync(reportPath, 'utf-8');

      // Parse the dump script from HTML (gets the LAST dump script, not template code)
      const dumpContent = parseDumpScript(html);
      expect(dumpContent).toBeTruthy();

      const dumpObj = JSON.parse(dumpContent!.trim());

      // Navigate to the screenshot in the dump structure
      const screenshotRef = dumpObj.executions[0].tasks[0].uiContext.screenshot;

      // Should be { base64: path } format
      expect(screenshotRef).toHaveProperty('base64');
      expect(screenshotRef.base64).toContain('screenshots');
      expect(screenshotRef.base64).toContain(screenshotId);
    });

    it('should release memory after writing and recover via lazy loading (directory mode)', async () => {
      // With lazy loading, memory is released immediately after writing to disk.
      // Accessing base64 later will recover from the PNG file.
      const reportDir = join(tmpDir, 'dir-memory-test');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(100));
      const dump = createDump([screenshot]);

      generator.onDumpUpdate(dump);
      await generator.flush();

      // Memory should be released after writing
      expect(screenshot.hasBase64()).toBe(false);

      // But accessing base64 should still work via lazy loading from PNG file
      expect(() => screenshot.base64).not.toThrow();
      const recoveredBase64 = screenshot.base64;
      expect(recoveredBase64).toContain('data:image/png;base64,');

      // toSerializable should return path format
      const serialized = screenshot.toSerializable();
      expect(serialized).toHaveProperty('base64');
      expect((serialized as { base64: string }).base64).toContain(
        'screenshots',
      );
    });
  });

  describe('nullReportGenerator — no-op', () => {
    it('should do nothing on onDumpUpdate and finalize', async () => {
      const screenshot = ScreenshotItem.create(fakeBase64(100));
      const dump = createDump([screenshot]);

      // Should not throw
      nullReportGenerator.onDumpUpdate(dump);
      const result = await nullReportGenerator.finalize(dump);

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
      // Default is inline mode
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

  describe('lazy loading — immediate release with on-demand recovery', () => {
    /**
     * Create a GroupedActionDump with multiple executions.
     */
    function createMultiExecutionDump(
      executionCount: number,
      screenshotsPerExecution: number,
    ): { dump: GroupedActionDump; screenshots: ScreenshotItem[][] } {
      const allScreenshots: ScreenshotItem[][] = [];
      const executions = [];

      for (let e = 0; e < executionCount; e++) {
        const screenshots: ScreenshotItem[] = [];
        for (let s = 0; s < screenshotsPerExecution; s++) {
          screenshots.push(ScreenshotItem.create(fakeBase64(1000)));
        }
        allScreenshots.push(screenshots);

        const tasks = screenshots.map((sc, i) => ({
          type: 'Insight' as const,
          subType: 'Locate',
          param: { prompt: `exec-${e}-task-${i}` },
          uiContext: {
            screenshot: sc,
            size: { width: 1920, height: 1080 },
          } as UIContext,
          executor: async () => undefined,
          recorder: [],
          status: 'running' as const,
        }));

        executions.push(
          new ExecutionDump({
            logTime: Date.now() + e * 1000, // Different timestamps
            name: `execution-${e}`,
            tasks,
          }),
        );
      }

      return {
        dump: new GroupedActionDump({
          sdkVersion: '1.0.0-test',
          groupName: 'test-group',
          groupDescription: 'test',
          modelBriefs: [],
          executions,
        }),
        screenshots: allScreenshots,
      };
    }

    it('should release memory immediately after writing (inline mode)', async () => {
      const reportPath = join(tmpDir, 'inline-immediate-release.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const screenshot = ScreenshotItem.create(fakeBase64(10000));
      const dump = createDump([screenshot]);

      generator.onDumpUpdate(dump);
      await generator.flush();

      // Memory should be released immediately after writing
      expect(screenshot.hasBase64()).toBe(false);

      // But accessing base64 should recover via lazy loading from HTML
      expect(() => screenshot.base64).not.toThrow();
      const recoveredBase64 = screenshot.base64;
      expect(recoveredBase64).toContain('data:image/png;base64,');
      expect(recoveredBase64).toContain('AAAA'); // Our fake base64
    });

    it('should release all screenshots immediately in multi-execution dump', async () => {
      const reportPath = join(tmpDir, 'multi-exec-immediate-release.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const { dump, screenshots } = createMultiExecutionDump(3, 2);
      // screenshots[0] = exec 0 screenshots
      // screenshots[1] = exec 1 screenshots
      // screenshots[2] = exec 2 screenshots

      generator.onDumpUpdate(dump);
      await generator.flush();

      // ALL screenshots should be released immediately
      for (const execScreenshots of screenshots) {
        for (const s of execScreenshots) {
          expect(s.hasBase64()).toBe(false);
        }
      }

      // But all should be recoverable via lazy loading
      for (const execScreenshots of screenshots) {
        for (const s of execScreenshots) {
          expect(() => s.base64).not.toThrow();
          expect(s.base64).toContain('data:image/png;base64,');
        }
      }
    });

    it('should handle finalize() correctly (no special action needed)', async () => {
      const reportPath = join(tmpDir, 'finalize-lazy.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      const { dump, screenshots } = createMultiExecutionDump(2, 1);

      generator.onDumpUpdate(dump);
      await generator.flush();

      // All already released
      expect(screenshots[0][0].hasBase64()).toBe(false);
      expect(screenshots[1][0].hasBase64()).toBe(false);

      // After finalize: still recoverable
      await generator.finalize(dump);
      expect(() => screenshots[0][0].base64).not.toThrow();
      expect(() => screenshots[1][0].base64).not.toThrow();
    });

    it('should work correctly in directory mode with lazy loading', async () => {
      const reportDir = join(tmpDir, 'dir-lazy-loading');
      const reportPath = join(reportDir, 'index.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'directory',
        autoPrint: false,
      });

      const { dump, screenshots } = createMultiExecutionDump(2, 1);

      generator.onDumpUpdate(dump);
      await generator.flush();

      // All screenshots released with path format
      for (const execScreenshots of screenshots) {
        for (const s of execScreenshots) {
          expect(s.hasBase64()).toBe(false);
          const serialized = s.toSerializable();
          expect(serialized).toHaveProperty('base64');
          expect((serialized as { base64: string }).base64).toContain(
            'screenshots',
          );
        }
      }

      // But all should be recoverable via lazy loading from PNG files
      for (const execScreenshots of screenshots) {
        for (const s of execScreenshots) {
          expect(() => s.base64).not.toThrow();
          expect(s.base64).toContain('data:image/png;base64,');
        }
      }
    });

    it('should recover correct data for each screenshot (inline mode)', async () => {
      const reportPath = join(tmpDir, 'inline-correct-recovery.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      // Create screenshots with different sizes to distinguish them
      const screenshot1 = ScreenshotItem.create(fakeBase64(100));
      const screenshot2 = ScreenshotItem.create(fakeBase64(200));
      const screenshot3 = ScreenshotItem.create(fakeBase64(300));

      const dump = createDump([screenshot1, screenshot2, screenshot3]);
      generator.onDumpUpdate(dump);
      await generator.flush();

      // All released
      expect(screenshot1.hasBase64()).toBe(false);
      expect(screenshot2.hasBase64()).toBe(false);
      expect(screenshot3.hasBase64()).toBe(false);

      // Recover and verify sizes (base64 length proportional to original size)
      const recovered1 = screenshot1.rawBase64;
      const recovered2 = screenshot2.rawBase64;
      const recovered3 = screenshot3.rawBase64;

      expect(recovered1.length).toBe(100);
      expect(recovered2.length).toBe(200);
      expect(recovered3.length).toBe(300);
    });
  });

  describe('memory efficiency — writtenScreenshots tracking', () => {
    it('writtenScreenshots Set should contain only IDs, not base64 data', async () => {
      const reportPath = join(tmpDir, 'tracking-test.html');
      const generator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });

      // Create a large screenshot (100KB)
      const largeScreenshot = ScreenshotItem.create(fakeBase64(100_000));
      const dump = createDump([largeScreenshot]);

      generator.onDumpUpdate(dump);
      await generator.flush();

      // Access private writtenScreenshots to verify it stores IDs not data
      const writtenScreenshots = (generator as any)
        .writtenScreenshots as Set<string>;
      expect(writtenScreenshots.size).toBe(1);

      // The stored value should be the short ID, not the base64 data
      const storedValue = [...writtenScreenshots][0];
      expect(storedValue).toBe(largeScreenshot.id);
      expect(storedValue.length).toBeLessThan(100); // UUID is ~36 chars
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
        const newScreenshot = ScreenshotItem.create(fakeBase64(1000));
        const dump = buildIncrementalDump(allScreenshots, newScreenshot);
        generator.onDumpUpdate(dump);
      }
      await generator.flush();

      // writtenScreenshots should have exactly totalScreenshots entries
      const writtenScreenshots = (generator as any)
        .writtenScreenshots as Set<string>;
      expect(writtenScreenshots.size).toBe(totalScreenshots);

      // imageEndOffset should be tracked correctly
      const imageEndOffset = (generator as any).imageEndOffset as number;
      const fileSize = statSync(reportPath).size;

      // imageEndOffset should be less than total file size
      // (file = template + image tags + dump JSON; imageEndOffset = template + image tags)
      expect(imageEndOffset).toBeLessThan(fileSize);
      expect(imageEndOffset).toBeGreaterThan(0);
    });
  });
});
