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

  it('releases memory after persist and supports recovery in directory mode', () => {
    const reportPath = join(tmpRoot, 'index.html');
    const screenshotsDir = join(tmpRoot, 'screenshots');
    const item = ScreenshotItem.create(pngBase64, 100);
    const store = new ScreenshotStore({
      mode: 'directory',
      reportPath,
      screenshotsDir,
    });

    const ref = store.persist(item);
    expect(item.hasBase64()).toBe(false);
    expect(ref.storage).toBe('file');
    expect(existsSync(join(screenshotsDir, `${item.id}.png`))).toBe(true);
    expect(store.loadBase64(ref)).toContain('data:image/png;base64,');
  });

  it('deduplicates same screenshot persistence by id', () => {
    const reportPath = join(tmpRoot, 'index.html');
    const screenshotsDir = join(tmpRoot, 'screenshots');
    const item = ScreenshotItem.create(pngBase64, 100);
    const store = new ScreenshotStore({
      mode: 'directory',
      reportPath,
      screenshotsDir,
    });

    const first = store.persist(item);
    writeFileSync(join(screenshotsDir, `${item.id}.png`), 'marker');
    const second = store.persist(item);

    expect(first.id).toBe(second.id);
    expect(readFileSync(join(screenshotsDir, `${item.id}.png`), 'utf-8')).toBe(
      'marker',
    );
  });

  it('supports inline mode persistence + lazy restore', () => {
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

    const ref = store.persist(item);
    expect(item.hasBase64()).toBe(false);
    expect(appendInline).toHaveBeenCalledTimes(1);
    expect(store.loadBase64(ref)).toBe(pngBase64);
  });

  it('can ensure shared file copy while preserving inline mode semantics', () => {
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
      ensureFileCopy: true,
    });
    const item = ScreenshotItem.create(pngBase64, 100);

    const ref = store.persist(item);
    expect(ref.storage).toBe('inline');
    expect(appendInline).toHaveBeenCalledTimes(1);
    expect(existsSync(join(screenshotsDir, `${item.id}.png`))).toBe(true);
    expect(store.loadBase64(ref)).toBe(pngBase64);
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
