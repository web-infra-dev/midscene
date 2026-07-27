import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeAndroidAuditExportWithDownload } from '../../src/android-audit-export';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Android audit report export', () => {
  it('writes the ignored report structure with raw XML and the full UiNode tree', async () => {
    const outputRoot = await mkdtemp(
      path.join(tmpdir(), 'midscene-android-audit-export-'),
    );
    temporaryDirectories.push(outputRoot);
    const root = {
      attrs: {},
      bounds: { left: 0, top: 0, width: 400, height: 800 },
      children: [],
      type: 'android.widget.FrameLayout',
    };
    const source = {
      captureId: 'source',
      capturedAt: '2026-07-22T01:00:00.000Z',
      dpr: 1,
      durationMs: 10,
      logicalSize: { width: 400, height: 800 },
      root,
      rotation: 0,
      source: 'yadb' as const,
      sourceXml: '<hierarchy></hierarchy>',
    };
    const { download, result } = await writeAndroidAuditExportWithDownload(
      {
        deviceId: 'serial-1',
        entryPath: 'Opened manually',
        environment: {
          device: {
            serial: 'serial-1',
            manufacturer: 'Fixture',
            model: 'Phone',
            androidVersion: '15',
            apiLevel: '35',
            resolution: {
              physical: { width: 400, height: 800 },
              logical: { width: 400, height: 800 },
              screenshot: { width: 400, height: 800 },
            },
            density: 160,
            dpr: 1,
            rotation: 0,
          },
          app: {
            expectedPackage: 'com.example.app',
            package: 'com.example.app',
            activity: '.MainActivity',
            versionName: '1.2.3',
            versionCode: '123',
          },
        },
        fresh: { ...source, captureId: 'fresh' },
        overlays: [],
        replay: { attempted: 0, hits: 0, misses: 0, wrongMappings: 0 },
        replayResults: [],
        screenshotBase64: Buffer.from('fake-png').toString('base64'),
        screenshotCapturedAt: '2026-07-22T01:00:00.500Z',
        source,
        technology: {
          declaredStack: 'unknown',
          confidence: 'unknown',
          evidence: ['No declaration'],
        },
        treeNodes: [],
        visualElements: [],
      },
      outputRoot,
    );
    const pageDir = path.join(result.outputDir, 'pages', 'playground-current');

    await expect(
      readFile(path.join(pageDir, 'source-used.xml'), 'utf8'),
    ).resolves.toBe(source.sourceXml);
    await expect(
      readFile(path.join(pageDir, 'ui-tree.json'), 'utf8'),
    ).resolves.toContain('android.widget.FrameLayout');
    const indexHtml = await readFile(result.indexHtml, 'utf8');
    expect(indexHtml).toContain('pages/playground-current/screenshot.png');
    expect(indexHtml).toContain('<html lang="en">');
    expect(indexHtml).toContain('Android XPath Audit');
    expect(indexHtml).toContain('Complete UiNode Tree (0)');
    expect(indexHtml).not.toMatch(/\p{Script=Han}/u);
    const metadata = JSON.parse(
      await readFile(path.join(pageDir, 'metadata.json'), 'utf8'),
    );
    expect(metadata).toMatchObject({
      schemaVersion: 2,
      reportKind: 'playground-live',
      entryPath: 'Opened manually',
      app: { package: 'com.example.app', versionName: '1.2.3' },
      device: { manufacturer: 'Fixture', model: 'Phone' },
      sourceUsed: 'yadb',
      captures: {
        source: {
          screenshot: { capturedAt: '2026-07-22T01:00:00.500Z' },
        },
      },
    });
    expect(download).toMatchObject({
      directoryName: result.runId,
      runId: result.runId,
    });
    expect(download.files.map((file) => file.relativePath)).toEqual([
      'run.json',
      'summary.json',
      'index.html',
      'pages/playground-current/metadata.json',
      'pages/playground-current/screenshot.png',
      'pages/playground-current/source-used.xml',
      'pages/playground-current/yadb.xml',
      'pages/playground-current/fresh-replay.xml',
      'pages/playground-current/ui-tree.json',
      'pages/playground-current/visual-elements.json',
      'pages/playground-current/elements.json',
      'pages/playground-current/replay-results.json',
      'pages/playground-current/annotated.html',
    ]);
    const screenshotFile = download.files.find(
      (file) => file.relativePath === 'pages/playground-current/screenshot.png',
    );
    expect(screenshotFile).toBeDefined();
    expect(
      Buffer.from(screenshotFile!.contentBase64, 'base64').toString(),
    ).toBe('fake-png');
  });
});
