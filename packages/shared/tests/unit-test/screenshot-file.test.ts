import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeCliScreenshotFile } from '../../src/cli/screenshot-file';
import { collectScreenshotRefs } from '../../src/cli/verbose-screenshot';

const webpBase64 =
  'UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

describe('CLI WebP screenshot files', () => {
  const temporaryDirectories: string[] = [];

  const makeTemporaryDirectory = () => {
    const directory = mkdtempSync(join(tmpdir(), 'midscene-webp-'));
    temporaryDirectories.push(directory);
    return directory;
  };

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('uses the .webp extension from screenshot MIME metadata', () => {
    const directoryPath = makeTemporaryDirectory();
    const filePath = writeCliScreenshotFile(webpBase64, {
      id: 'webp-shot',
      mimeType: 'image/webp',
      directoryPath,
    });

    expect(filePath).toBe(join(directoryPath, 'webp-shot.webp'));
    expect(readFileSync(filePath).toString('base64')).toBe(webpBase64);
  });

  it('exports inline WebP screenshots for verbose output', () => {
    const directoryPath = makeTemporaryDirectory();
    const screenshot = {
      base64: `data:image/webp;base64,${webpBase64}`,
      extension: 'webp',
      toSerializable: () => ({
        type: 'midscene_screenshot_ref' as const,
        id: 'inline-webp',
        capturedAt: 1,
        mimeType: 'image/webp',
        storage: 'inline',
      }),
    };

    const [collected] = collectScreenshotRefs(screenshot, {
      exportMode: 'report',
      reportFile: join(directoryPath, 'report.html'),
    });

    expect(collected.file).toBe('inline-webp.webp');
    expect(
      existsSync(join(directoryPath, 'screenshots', 'inline-webp.webp')),
    ).toBe(true);
  });
});
