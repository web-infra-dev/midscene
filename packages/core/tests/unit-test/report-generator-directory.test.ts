import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { parseDumpScript } from '@/dump/html-utils';
import { ReportGenerator } from '@/report-generator';
import { ScreenshotItem } from '@/screenshot-item';
import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import {
  createExecution,
  createPatternedPngFixture,
  decodeImagePixels,
  defaultReportMeta,
  fakeBase64,
  getReportGeneratorTmpDir,
  parseScriptAttributes,
} from './test-helpers/report-generator';
import {
  countGroupedDumpScripts,
  extractGroupedDumpScripts,
} from './test-helpers/report-html';

describe('ReportGenerator directory mode', () => {
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = getReportGeneratorTmpDir('report-directory');
  });

  afterEach(() => {
    if (existsSync(temporaryDirectory)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it('preserves exact screenshot pixels in external assets', async () => {
    const reportDirectory = join(temporaryDirectory, 'pixel-integrity');
    const reportPath = join(reportDirectory, 'index.html');
    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'directory',
      autoPrint: false,
    });
    const { dataUri, expectedImage } = await createPatternedPngFixture();
    const screenshot = ScreenshotItem.create(dataUri, Date.now());

    generator.onExecutionUpdate(
      createExecution([screenshot]),
      defaultReportMeta,
    );
    await generator.finalize();

    const screenshotPath = join(
      reportDirectory,
      'screenshots',
      `${screenshot.id}.png`,
    );
    expect(existsSync(screenshotPath)).toBe(true);
    await expect(
      decodeImagePixels(readFileSync(screenshotPath)),
    ).resolves.toEqual(expectedImage);
  });

  it('writes each PNG/JPEG once with typed file references', async () => {
    const reportPath = join(temporaryDirectory, 'typed-assets', 'index.html');
    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'directory',
      persistExecutionDump: true,
      autoPrint: false,
    });
    const png = ScreenshotItem.create(fakeBase64(500), Date.now());
    const jpeg = ScreenshotItem.create(fakeBase64(500, 'jpeg'), Date.now());
    const execution = createExecution([png, jpeg]);

    generator.onExecutionUpdate(execution, defaultReportMeta);
    await generator.flush();

    const screenshotsDirectory = join(
      temporaryDirectory,
      'typed-assets',
      'screenshots',
    );
    const pngPath = join(screenshotsDirectory, `${png.id}.png`);
    const jpegPath = join(screenshotsDirectory, `${jpeg.id}.jpeg`);
    expect(existsSync(pngPath)).toBe(true);
    expect(existsSync(jpegPath)).toBe(true);
    const initialModificationTime = statSync(pngPath).mtimeMs;

    generator.onExecutionUpdate(execution, defaultReportMeta);
    await generator.flush();
    expect(statSync(pngPath).mtimeMs).toBe(initialModificationTime);

    const html = readFileSync(reportPath, 'utf-8');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('</html>');
    const dump = JSON.parse(parseDumpScript(html));
    expect(dump.executions[0].tasks[0].uiContext.screenshot).toMatchObject({
      type: 'midscene_screenshot_ref',
      storage: 'file',
      path: `./screenshots/${png.id}.png`,
    });
    expect(dump.executions[0].tasks[1].uiContext.screenshot).toMatchObject({
      type: 'midscene_screenshot_ref',
      storage: 'file',
      path: `./screenshots/${jpeg.id}.jpeg`,
    });
  });

  it('appends updates, merges attributes, and compacts on finalize', async () => {
    const reportPath = join(temporaryDirectory, 'updates', 'index.html');
    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'directory',
      persistExecutionDump: true,
      autoPrint: false,
    });
    const screenshot = ScreenshotItem.create(fakeBase64(100), Date.now());
    const execution = createExecution([screenshot]);

    generator.onExecutionUpdate(execution, defaultReportMeta, {
      playwright_test_title: 'first title',
    });
    generator.onExecutionUpdate(execution, defaultReportMeta, {
      playwright_test_title: 'final title',
      playwright_test_duration: 456,
    });
    await generator.flush();

    let html = readFileSync(reportPath, 'utf-8');
    const dumpScripts = extractGroupedDumpScripts(html);
    expect(dumpScripts).toHaveLength(2);
    expect(parseScriptAttributes(dumpScripts[1].openTag)).toMatchObject({
      playwright_test_title: 'final title',
      playwright_test_duration: '456',
    });
    expect(
      readdirSync(join(temporaryDirectory, 'updates')).filter((name) =>
        /^\d+\.execution\.json$/.test(name),
      ),
    ).toEqual(['1.execution.json']);

    await generator.finalize();
    html = readFileSync(reportPath, 'utf-8');
    expect(countGroupedDumpScripts(html)).toBe(1);
    expect(
      existsSync(
        join(
          temporaryDirectory,
          'updates',
          'screenshots',
          `${screenshot.id}.png`,
        ),
      ),
    ).toBe(true);
  });

  it('releases screenshot memory and recovers it from the written file', async () => {
    const reportPath = join(temporaryDirectory, 'lazy', 'index.html');
    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'directory',
      autoPrint: false,
    });
    const screenshot = ScreenshotItem.create(fakeBase64(1000), Date.now());

    generator.onExecutionUpdate(
      createExecution([screenshot]),
      defaultReportMeta,
    );
    await generator.flush();

    expect(screenshot.hasBase64()).toBe(false);
    expect(screenshot.base64).toContain('data:image/png;base64,');
    expect(screenshot.toSerializable()).toMatchObject({
      type: 'midscene_screenshot_ref',
      storage: 'file',
    });
  });

  it('keeps distinct execution IDs even when names match', async () => {
    const reportPath = join(temporaryDirectory, 'executions', 'index.html');
    const generator = new ReportGenerator({
      reportPath,
      screenshotMode: 'directory',
      autoPrint: false,
    });

    for (const id of ['directory-id-1', 'directory-id-2']) {
      generator.onExecutionUpdate(
        createExecution(
          [ScreenshotItem.create(fakeBase64(100), Date.now())],
          'Act - click login',
          id,
        ),
        defaultReportMeta,
      );
      await generator.flush();
    }

    expect(countGroupedDumpScripts(readFileSync(reportPath, 'utf-8'))).toBe(2);
  });
});
