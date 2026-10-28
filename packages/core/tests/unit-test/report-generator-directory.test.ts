import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  readReportArtifactManifest,
  readReportDumpScripts,
} from '@/dump/report-artifact-reader';
import { restoreImageReferences } from '@/dump/screenshot-restoration';
import { resolveImageSource } from '@/dump/screenshot-store';
import { ReportImageStore } from '@/dump/screenshot-store';
import { collectDedupedExecutions, isDirectoryModeReport } from '@/report';
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
  screenshotFilePath,
} from './test-helpers/report-generator';

// The HTML is only a Viewer. Facts and assets can be inspected without rendering it.
describe('ReportGenerator directory mode', () => {
  let root: string;
  beforeEach(() => {
    root = getReportGeneratorTmpDir('report-directory');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const generatorAt = (path: string, reuseExistingReport = false) =>
    new ReportGenerator({
      reportPath: path,
      screenshotMode: 'directory',
      autoPrint: false,
      reuseExistingReport,
    });

  it('preserves the same facts and images in standalone HTML and directory reports', async () => {
    const screenshot = ScreenshotItem.create(fakeBase64(100), 100);
    const execution = createExecution([screenshot], 'failed login', 'login');
    execution.tasks[0].status = 'failed';
    execution.tasks[0].errorMessage = 'Login button is missing';
    const meta = {
      ...defaultReportMeta,
      modelBriefs: [{ name: 'test-model' }],
    };
    const restored: unknown[] = [];
    for (const mode of ['inline', 'directory'] as const) {
      const path =
        mode === 'inline'
          ? join(root, 'single.html')
          : join(root, 'external', 'index.html');
      const generator = new ReportGenerator({
        reportPath: path,
        screenshotMode: mode,
        autoPrint: false,
      });
      generator.onExecutionUpdate(execution, meta);
      await generator.finalize();
      const store = new ReportImageStore({ mode, reportPath: path });
      const dump = restoreImageReferences(
        JSON.parse(readReportDumpScripts(path)[0].content),
        (ref) => store.loadDataUri(ref),
      );
      restored.push(
        JSON.parse(
          JSON.stringify(dump, (key, value) =>
            key === 'sourceRef' ? undefined : value,
          ),
        ),
      );
    }
    expect(restored[0]).toEqual(restored[1]);
    expect(JSON.stringify(restored[0])).toContain('Login button is missing');
    expect(JSON.stringify(restored[0])).toContain('test-model');
    expect(existsSync(join(root, 'screenshots'))).toBe(false);
  });

  it('preserves explicit constructor entry names and fails loudly for incompatible reuse', async () => {
    const path = join(root, 'custom.html');
    const generator = generatorAt(path);
    generator.onExecutionUpdate(createExecution([]), defaultReportMeta);
    await generator.finalize();
    expect(readReportArtifactManifest(path)?.entry).toBe('custom.html');
    expect(isDirectoryModeReport(path)).toBe(true);
    expect(() => generatorAt(path, true)).not.toThrow();
    const inlinePath = join(root, 'inline.html');
    const inline = new ReportGenerator({
      reportPath: inlinePath,
      screenshotMode: 'inline',
      autoPrint: false,
    });
    inline.onExecutionUpdate(createExecution([]), defaultReportMeta);
    await inline.finalize();
    expect(() => generatorAt(inlinePath, true)).toThrow(
      'incompatible directory report',
    );
  });

  it('preserves exact screenshot pixels in portable external assets', async () => {
    const reportPath = join(root, 'pixels', 'index.html');
    const generator = generatorAt(reportPath);
    const { dataUri, expectedImage } = await createPatternedPngFixture();
    const screenshot = ScreenshotItem.create(dataUri, 100);
    generator.onExecutionUpdate(
      createExecution([screenshot]),
      defaultReportMeta,
    );
    await generator.finalize();
    await expect(
      decodeImagePixels(
        readFileSync(screenshotFilePath(dirname(reportPath), screenshot)),
      ),
    ).resolves.toEqual(expectedImage);
    expect(readFileSync(reportPath, 'utf8')).not.toContain(dataUri);
    expect(readReportArtifactManifest(reportPath)?.status).toBe('complete');
    expect(readdirSync(dirname(reportPath)).sort()).toEqual([
      'data',
      'index.html',
      'report.json',
      'screenshots',
    ]);
    renameSync(dirname(reportPath), join(root, 'moved'));
    const moved = join(root, 'moved', 'index.html');
    const dump = JSON.parse(readReportDumpScripts(moved)[0].content);
    const resolved = resolveImageSource(
      dump.executions[0].tasks[0].uiContext.screenshot,
      { reportPath: moved },
    );
    expect(resolved.type).toBe('file');
    if (resolved.type === 'file')
      await expect(
        decodeImagePixels(readFileSync(resolved.filePath)),
      ).resolves.toEqual(expectedImage);
  });

  it('writes typed PNG/JPEG assets once and releases recoverable screenshot memory', async () => {
    const path = join(root, 'typed', 'index.html');
    const generator = generatorAt(path);
    const png = ScreenshotItem.create(fakeBase64(500), 100);
    const jpeg = ScreenshotItem.create(fakeBase64(500, 'jpeg'), 200);
    const execution = createExecution([png, jpeg]);
    generator.onExecutionUpdate(execution, defaultReportMeta);
    await generator.flush();
    const pngPath = screenshotFilePath(dirname(path), png);
    const mtime = statSync(pngPath).mtimeMs;
    generator.onExecutionUpdate(execution, defaultReportMeta);
    await generator.finalize();
    expect(statSync(pngPath).mtimeMs).toBe(mtime);
    expect(png.hasBase64()).toBe(false);
    expect(png.base64).toBe(fakeBase64(500));
    const dump = JSON.parse(readReportDumpScripts(path)[0].content);
    for (const [index, item] of [png, jpeg].entries()) {
      const ref = dump.executions[0].tasks[index].uiContext.screenshot;
      expect(ref).toMatchObject({
        type: 'midscene_screenshot_ref',
        id: item.id,
        capturedAt: item.capturedAt,
        storage: 'file',
      });
      expect(ref.path).toMatch(
        index === 0 ? /[a-f0-9]{64}\.png$/ : /[a-f0-9]{64}\.jpeg$/,
      );
      expect(existsSync(join(dirname(path), ref.path))).toBe(true);
    }
  });

  it('replaces progress facts, preserves independent observations and publishes attributes', async () => {
    const path = join(root, 'updates', 'index.html');
    const generator = new ReportGenerator({
      reportPath: path,
      screenshotMode: 'directory',
      persistExecutionDump: true,
      autoPrint: false,
    });
    const first = ScreenshotItem.create(fakeBase64(100), 100);
    const second = ScreenshotItem.create(fakeBase64(100), 200);
    const execution = createExecution([first, second], 'login', 'login');
    generator.onExecutionUpdate(execution, defaultReportMeta, {
      playwright_test_title: 'first',
    });
    await generator.flush();
    const firstHtml = readFileSync(path, 'utf8');
    const dataPath = readReportArtifactManifest(path)!.groups[0].dumps[0];
    execution.name = 'login finished';
    generator.onExecutionUpdate(execution, defaultReportMeta, {
      playwright_test_title: 'final',
      playwright_test_duration: 456,
    });
    await generator.finalize();
    expect(readFileSync(path, 'utf8')).toBe(firstHtml);
    const scripts = readReportDumpScripts(path);
    expect(scripts).toHaveLength(1);
    expect(parseScriptAttributes(scripts[0].openTag)).toMatchObject({
      playwright_test_title: 'final',
      playwright_test_duration: '456',
    });
    expect(JSON.parse(scripts[0].content).executions[0].name).toBe(
      'login finished',
    );
    expect(readReportArtifactManifest(path)!.groups[0].dumps).toEqual([
      dataPath,
    ]);
    expect(readdirSync(join(dirname(path), 'screenshots'))).toHaveLength(1);
    expect(
      readdirSync(dirname(path)).some((name) =>
        name.endsWith('.execution.json'),
      ),
    ).toBe(false);
    expect(first.id).not.toBe(second.id);
  });

  it('retains all execution IDs and reused Agent groups for report tools', async () => {
    const path = join(root, 'reuse', 'index.html');
    for (const stream of ['a', 'b']) {
      const generator = generatorAt(path, true);
      for (const step of ['1', '2']) {
        generator.onExecutionUpdate(
          createExecution([], 'same name', `${stream}-${step}`),
          defaultReportMeta,
        );
      }
      await generator.finalize();
    }
    expect(isDirectoryModeReport(path)).toBe(true);
    expect(readReportArtifactManifest(path)?.groups).toHaveLength(2);
    expect(
      collectDedupedExecutions(path).executions.map(
        (execution) => execution.id,
      ),
    ).toEqual(['a-1', 'a-2', 'b-1', 'b-2']);
  });
});
