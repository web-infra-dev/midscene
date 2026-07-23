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
import { ScreenshotStore } from '../../src/dump/screenshot-store';
import { ScreenshotItem } from '../../src/screenshot-item';

describe('ScreenshotStore', () => {
  const pngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
  const webpBody =
    'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';
  const webpBase64 = `data:image/webp;base64,${webpBody}`;
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

  it('persists WebP bytes with a .webp path and restores the WebP MIME type', async () => {
    const reportPath = join(tmpRoot, 'index.html');
    const screenshotsDir = join(tmpRoot, 'screenshots');
    const item = ScreenshotItem.create(webpBase64, 100);
    const store = new ScreenshotStore({
      mode: 'directory',
      reportPath,
      screenshotsDir,
    });

    const ref = await store.persist(item);
    const filePath = join(screenshotsDir, `${item.id}.webp`);

    expect(ref).toMatchObject({
      mimeType: 'image/webp',
      path: `./screenshots/${item.id}.webp`,
    });
    expect(readFileSync(filePath).toString('base64')).toBe(webpBody);
    expect(store.loadBase64(ref)).toBe(webpBase64);
  });

  it('resolves sibling WebP files for inline references', () => {
    const reportPath = join(tmpRoot, 'index.html');
    const screenshotsDir = join(tmpRoot, 'screenshots');
    mkdirSync(screenshotsDir, { recursive: true });
    writeFileSync(reportPath, '<html></html>');
    writeFileSync(
      join(screenshotsDir, 'sibling-webp.webp'),
      Buffer.from(webpBody, 'base64'),
    );
    const store = new ScreenshotStore({
      mode: 'inline',
      reportPath,
      writeInlineImage: () => {},
    });

    expect(
      store.loadBase64({
        type: 'midscene_screenshot_ref',
        id: 'sibling-webp',
        capturedAt: 100,
        mimeType: 'image/webp',
        storage: 'inline',
      }),
    ).toBe(webpBase64);
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
