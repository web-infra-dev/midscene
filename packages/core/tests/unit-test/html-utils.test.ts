import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractImageByIdSync,
  extractLastDumpScriptSync,
  generateImageScriptTag,
  streamImageScriptsToFile,
} from '../../src/dump/html-utils';
import { getTmpFile } from '../../src/utils';

describe('html-utils', () => {
  describe('extractImageByIdSync', () => {
    const fixturesDir = join(__dirname, '../fixtures/report-samples');
    const inlineSamplePath = join(fixturesDir, 'inline-sample.html');

    it('should extract image by id from HTML file', () => {
      const result = extractImageByIdSync(inlineSamplePath, 'test-id-001');
      expect(result).toBe(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      );
    });

    it('should extract different images by their ids', () => {
      const result1 = extractImageByIdSync(inlineSamplePath, 'test-id-001');
      const result2 = extractImageByIdSync(inlineSamplePath, 'test-id-002');
      const result3 = extractImageByIdSync(inlineSamplePath, 'test-id-003');

      expect(result1).toContain('iVBORw0KGgoAAAANSUhEUgAAAAE');
      expect(result2).toContain('iVBORw0KGgoAAAANSUhEUgAAAAI');
      expect(result3).toContain('iVBORw0KGgoAAAANSUhEUgAAAAM');

      // All should be different
      expect(result1).not.toBe(result2);
      expect(result2).not.toBe(result3);
    });

    it('should return null for non-existent id', () => {
      const result = extractImageByIdSync(inlineSamplePath, 'non-existent-id');
      expect(result).toBeNull();
    });

    it('should throw for non-existent file', () => {
      expect(() =>
        extractImageByIdSync('/non-existent-file.html', 'test-id-001'),
      ).toThrow();
    });

    // Integration test with real report files (skipped if files don't exist)
    describe('integration with real reports', () => {
      const realInlineReport = join(
        __dirname,
        '../../../web-integration/midscene_run/report/puppeteer-2026-02-03_10-38-58-f3167a8e.html',
      );
      const realFolderReport = join(
        __dirname,
        '../../../web-integration/midscene_run/report/puppeteer-2026-02-03_10-39-07-1afa62d2',
      );

      const realInlineExists = existsSync(realInlineReport);
      const realFolderExists = existsSync(realFolderReport);

      it.skipIf(!realInlineExists)(
        'should extract image from real inline report',
        () => {
          // Known image ID from the real report
          const imageId = 'f30c01ea-1f97-49e8-8a34-ac7972044ce3';
          const result = extractImageByIdSync(realInlineReport, imageId);

          expect(result).not.toBeNull();
          expect(result).toContain('data:image/');
          expect(result).toContain('base64,');
        },
      );

      it.skipIf(!realFolderExists)(
        'should work with folder report HTML (no inline images)',
        () => {
          const indexHtml = join(realFolderReport, 'index.html');
          // Folder mode reports don't have inline images, so this should return null
          const result = extractImageByIdSync(
            indexHtml,
            '50a74f81-6750-4a9b-a11b-7842ae1b897b',
          );
          expect(result).toBeNull();
        },
      );

      it.skipIf(!realFolderExists)(
        'should verify screenshot files exist in folder report',
        () => {
          const screenshotsDir = join(realFolderReport, 'screenshots');
          const imageFile = join(
            screenshotsDir,
            '50a74f81-6750-4a9b-a11b-7842ae1b897b.png',
          );

          expect(existsSync(imageFile)).toBe(true);

          // Verify it's a valid image (PNG or JPEG)
          const buffer = readFileSync(imageFile);
          expect(buffer.length).toBeGreaterThan(0);

          // Check for PNG magic bytes (0x89 0x50 0x4E 0x47) or JPEG (0xFF 0xD8)
          const isPng =
            buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4e &&
            buffer[3] === 0x47;
          const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;

          expect(isPng || isJpeg).toBe(true);
        },
      );
    });
  });

  describe('extractLastDumpScriptSync', () => {
    const fixturesDir = join(__dirname, '../fixtures/report-samples');
    const inlineSamplePath = join(fixturesDir, 'inline-sample.html');

    it('should extract dump script content from HTML file', () => {
      const result = extractLastDumpScriptSync(inlineSamplePath);
      expect(result).toBe('{"groupName":"test","executions":[]}');
    });

    it('should extract content from large HTML file', () => {
      const hugeContent = Buffer.alloc(3 * 1024 * 1024 - 200, 'a').toString();
      const largeHtmlPath = getTmpFile('html');
      if (!largeHtmlPath) {
        throw new Error('Failed to create temp html file');
      }
      writeFileSync(
        largeHtmlPath,
        `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
${hugeContent}
<script type="midscene_web_dump" type="application/json">
test
</script>
</body>
</html>
`,
        'utf8',
      );
      const result = extractLastDumpScriptSync(largeHtmlPath);
      unlinkSync(largeHtmlPath);
      expect(result).toBe('test');
    });

    it('should extract the LAST dump script when multiple exist', () => {
      const htmlPath = getTmpFile('html');
      if (!htmlPath) {
        throw new Error('Failed to create temp html file');
      }
      writeFileSync(
        htmlPath,
        `<!DOCTYPE html>
<html>
<body>
<script type="midscene_web_dump">first</script>
<script type="midscene_web_dump">second</script>
<script type="midscene_web_dump">last</script>
</body>
</html>
`,
        'utf8',
      );
      const result = extractLastDumpScriptSync(htmlPath);
      unlinkSync(htmlPath);
      expect(result).toBe('last');
    });

    it('should return empty string for file without dump script', () => {
      const htmlPath = getTmpFile('html');
      if (!htmlPath) {
        throw new Error('Failed to create temp html file');
      }
      writeFileSync(htmlPath, '<html><body>no script</body></html>', 'utf8');
      const result = extractLastDumpScriptSync(htmlPath);
      unlinkSync(htmlPath);
      expect(result).toBe('');
    });
  });

  describe('streamImageScriptsToFile', () => {
    it('should stream image scripts from source to destination', () => {
      const srcPath = getTmpFile('html');
      const destPath = getTmpFile('html');
      if (!srcPath || !destPath) {
        throw new Error('Failed to create temp files');
      }

      const imageTag1 = generateImageScriptTag(
        'img-1',
        'data:image/png;base64,AAA',
      );
      const imageTag2 = generateImageScriptTag(
        'img-2',
        'data:image/png;base64,BBB',
      );

      writeFileSync(
        srcPath,
        `<!DOCTYPE html>
<html>
<body>
${imageTag1}
${imageTag2}
<script type="midscene_web_dump">{"test":true}</script>
</body>
</html>
`,
        'utf8',
      );

      writeFileSync(destPath, '', 'utf8');
      streamImageScriptsToFile(srcPath, destPath);

      const destContent = readFileSync(destPath, 'utf8');
      expect(destContent).toContain('data-id="img-1"');
      expect(destContent).toContain('data-id="img-2"');
      expect(destContent).toContain('AAA');
      expect(destContent).toContain('BBB');

      unlinkSync(srcPath);
      unlinkSync(destPath);
    });

    it('should handle file with no image scripts', () => {
      const srcPath = getTmpFile('html');
      const destPath = getTmpFile('html');
      if (!srcPath || !destPath) {
        throw new Error('Failed to create temp files');
      }

      writeFileSync(srcPath, '<html><body>no images</body></html>', 'utf8');
      writeFileSync(destPath, '', 'utf8');

      streamImageScriptsToFile(srcPath, destPath);

      const destContent = readFileSync(destPath, 'utf8');
      expect(destContent).toBe('');

      unlinkSync(srcPath);
      unlinkSync(destPath);
    });
  });
});
