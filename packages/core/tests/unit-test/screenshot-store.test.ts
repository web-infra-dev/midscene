import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ScreenshotStore,
  normalizeImageUrlRef,
} from '../../src/dump/screenshot-store';
import { ScreenshotItem } from '../../src/screenshot-item';
import { ExecutionDump, ReportActionDump } from '../../src/types';

describe('ScreenshotStore', () => {
  const pngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = join(
      tmpdir(),
      `midscene-screenshot-store-${Date.now()}-${Math.random()}`,
    );
    mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('releases memory after persist and supports recovery in directory mode', async () => {
    const reportPath = join(tmpRoot, 'index.html');
    const screenshotsDir = join(tmpRoot, 'screenshots');
    const item = ScreenshotItem.create(pngBase64, 100);
    const store = new ScreenshotStore({
      mode: 'directory',
      reportPath,
      screenshotsDir,
    });

    const ref = await store.persist(item);
    expect(item.hasBase64()).toBe(false);
    expect(ref.storage).toBe('file');
    expect(existsSync(join(screenshotsDir, `${item.id}.png`))).toBe(true);
    expect(store.loadBase64(ref)).toContain('data:image/png;base64,');
  });

  it('round-trips screenshots through dump companion files', () => {
    const dumpPath = join(tmpRoot, 'execution.json');
    const screenshot = ScreenshotItem.create(pngBase64, 100);
    const execution = new ExecutionDump({
      id: 'execution-with-file-screenshot',
      logTime: 100,
      name: 'execution-with-file-screenshot',
      tasks: [
        {
          taskId: 'task-with-file-screenshot',
          type: 'Insight',
          subType: 'Locate',
          param: {},
          uiContext: {
            screenshot,
            shotSize: { width: 5, height: 5 },
            shrunkShotToLogicalRatio: 1,
          },
          executor: async () => undefined,
          recorder: [],
          status: 'finished',
        },
      ],
    });
    const dump = new ReportActionDump({
      sdkVersion: '1.0.0-test',
      groupName: 'companion-file-round-trip',
      modelBriefs: [],
      executions: [execution],
    });

    dump.serializeToFiles(dumpPath);
    const restored = JSON.parse(
      ReportActionDump.fromFilesAsInlineJson(dumpPath),
    );

    expect(restored.executions[0].tasks[0].uiContext.screenshot.base64).toBe(
      pngBase64,
    );
  });

  it('deduplicates same screenshot persistence by id', async () => {
    const reportPath = join(tmpRoot, 'index.html');
    const screenshotsDir = join(tmpRoot, 'screenshots');
    const item = ScreenshotItem.create(pngBase64, 100);
    const store = new ScreenshotStore({
      mode: 'directory',
      reportPath,
      screenshotsDir,
    });

    const first = await store.persist(item);
    writeFileSync(join(screenshotsDir, `${item.id}.png`), 'marker');
    const second = await store.persist(item);

    expect(first.id).toBe(second.id);
    expect(readFileSync(join(screenshotsDir, `${item.id}.png`), 'utf-8')).toBe(
      'marker',
    );
  });

  it('deduplicates inline reference images by content', async () => {
    const reportPath = join(tmpRoot, 'reference-inline.html');
    const appendInline = vi.fn();
    const store = new ScreenshotStore({
      mode: 'inline',
      reportPath,
      writeInlineImage: appendInline,
    });
    const referenceImage = 'data:image/webp;base64,QUJDRA==';

    const first = await store.persistReferenceImage(referenceImage);
    const repeated = await store.persistReferenceImage(referenceImage);
    const second = await store.persistReferenceImage(
      'data:image/webp;name=reference;base64,QUJD RA==',
    );

    expect(first).toMatchObject({
      type: 'midscene_image_url_ref',
      mimeType: 'image/webp',
      storage: 'inline',
    });
    expect(repeated).toBe(first);
    expect(second.id).toBe(first.id);
    expect(appendInline).toHaveBeenCalledOnce();
    expect(appendInline).toHaveBeenCalledWith(first.id, referenceImage);
  });

  it('persists non-PNG reference images with their own extension', async () => {
    const reportPath = join(tmpRoot, 'index.html');
    const screenshotsDir = join(tmpRoot, 'screenshots');
    const store = new ScreenshotStore({
      mode: 'directory',
      reportPath,
      screenshotsDir,
    });

    const ref = await store.persistReferenceImage(
      'data:image/svg+xml;base64,PHN2Zy8+',
    );

    expect(ref.path).toBe(`./screenshots/${ref.id}.svg`);
    expect(existsSync(join(screenshotsDir, `${ref.id}.svg`))).toBe(true);
    expect(store.loadDataUri(ref)).toBe('data:image/svg+xml;base64,PHN2Zy8+');
  });

  it('rejects malformed reference image data URLs', async () => {
    const store = new ScreenshotStore({
      mode: 'inline',
      reportPath: join(tmpRoot, 'invalid-reference.html'),
      writeInlineImage: () => {},
    });

    await expect(
      store.persistReferenceImage('data:image/png,not-base64'),
    ).rejects.toThrow('reference image must be a valid base64 image data URL');
  });

  it('rejects unsafe serialized reference-image file names', () => {
    expect(
      normalizeImageUrlRef({
        type: 'midscene_image_url_ref',
        id: '../outside',
        mimeType: 'image/webp',
        storage: 'inline',
      }),
    ).toBeNull();
  });

  it('supports inline mode persistence + lazy restore', async () => {
    const reportPath = join(tmpRoot, 'inline.html');
    const appendInline = vi.fn((id: string, base64: string) => {
      writeFileSync(
        reportPath,
        `<script type="midscene-image" data-id="${id}">${base64}</script>`,
      );
    });
    const store = new ScreenshotStore({
      mode: 'inline',
      reportPath,
      writeInlineImage: appendInline,
    });
    const item = ScreenshotItem.create(pngBase64, 100);

    const ref = await store.persist(item);
    expect(item.hasBase64()).toBe(false);
    expect(appendInline).toHaveBeenCalledTimes(1);
    expect(store.loadBase64(ref)).toBe(pngBase64);
  });

  it('can ensure shared file copy while preserving inline mode semantics', async () => {
    const reportPath = join(tmpRoot, 'inline-with-file-copy.html');
    const screenshotsDir = join(tmpRoot, 'screenshots');
    const appendInline = vi.fn((id: string, base64: string) => {
      writeFileSync(
        reportPath,
        `<script type="midscene-image" data-id="${id}">${base64}</script>`,
      );
    });
    const store = new ScreenshotStore({
      mode: 'inline',
      reportPath,
      screenshotsDir,
      writeInlineImage: appendInline,
      alsoWriteFileCopy: true,
    });
    const item = ScreenshotItem.create(pngBase64, 100);

    const ref = await store.persist(item);
    expect(ref.storage).toBe('inline');
    expect(item.toSerializable().storage).toBe('inline');
    expect(appendInline).toHaveBeenCalledTimes(1);
    expect(existsSync(join(screenshotsDir, `${item.id}.png`))).toBe(true);
    rmSync(join(screenshotsDir, `${item.id}.png`), { force: true });
    expect(item.base64).toBe(pngBase64);
    expect(store.loadBase64(ref)).toBe(pngBase64);
  });

  it('keeps supporting ensureFileCopy as a deprecated alias', async () => {
    const reportPath = join(tmpRoot, 'inline-with-deprecated-file-copy.html');
    const screenshotsDir = join(tmpRoot, 'screenshots');
    const appendInline = vi.fn((id: string, base64: string) => {
      writeFileSync(
        reportPath,
        `<script type="midscene-image" data-id="${id}">${base64}</script>`,
      );
    });
    const store = new ScreenshotStore({
      mode: 'inline',
      reportPath,
      screenshotsDir,
      writeInlineImage: appendInline,
      ensureFileCopy: true,
    });
    const item = ScreenshotItem.create(pngBase64, 100);

    const ref = await store.persist(item);
    expect(ref.storage).toBe('inline');
    expect(existsSync(join(screenshotsDir, `${item.id}.png`))).toBe(true);
  });
  it('throws on non-ScreenshotRef inputs', () => {
    const reportPath = join(tmpRoot, 'invalid-ref.html');
    const store = new ScreenshotStore({
      mode: 'inline',
      reportPath,
      writeInlineImage: () => {},
    });

    expect(() =>
      store.loadBase64({ $screenshot: 'legacy-id', capturedAt: 1 }),
    ).toThrow('invalid screenshot reference');
    expect(() =>
      store.loadBase64({ base64: './screenshots/legacy.png', capturedAt: 1 }),
    ).toThrow('invalid screenshot reference');
  });
});
