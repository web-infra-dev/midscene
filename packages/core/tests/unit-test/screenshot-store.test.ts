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
