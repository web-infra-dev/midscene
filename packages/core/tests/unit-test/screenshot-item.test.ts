import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScreenshotItem } from '../../src/screenshot-item';

describe('ScreenshotItem', () => {
  const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';

  describe('create', () => {
    it('should create a ScreenshotItem from base64 string', () => {
      const item = ScreenshotItem.create(testBase64);
      expect(item).toBeInstanceOf(ScreenshotItem);
      expect(item.base64).toBe(testBase64);
    });
  });

  describe('base64 getter', () => {
    it('should return the base64 data', () => {
      const item = ScreenshotItem.create(testBase64);
      expect(item.base64).toBe(testBase64);
    });
  });

  describe('toSerializable', () => {
    it('should return an object with $screenshot property', () => {
      const item = ScreenshotItem.create(testBase64);
      const serialized = item.toSerializable();
      expect(serialized).toHaveProperty('$screenshot');
      expect(typeof (serialized as { $screenshot: string }).$screenshot).toBe(
        'string',
      );
    });

    it('should produce JSON-serializable output', () => {
      const item = ScreenshotItem.create(testBase64);
      const obj = { screenshot: item };
      const serialized = JSON.stringify(obj, (_key, value) => {
        if (value && typeof value.toSerializable === 'function') {
          return value.toSerializable();
        }
        return value;
      });
      const parsed = JSON.parse(serialized);
      expect(parsed.screenshot).toHaveProperty('$screenshot');
      expect(typeof parsed.screenshot.$screenshot).toBe('string');
    });
  });

  describe('isSerialized', () => {
    it('should return true for inline mode format ($screenshot)', () => {
      expect(ScreenshotItem.isSerialized({ $screenshot: 'test-id' })).toBe(
        true,
      );
      expect(ScreenshotItem.isSerialized({ $screenshot: 'another-id' })).toBe(
        true,
      );
    });

    it('should return true for directory mode format (base64 path)', () => {
      expect(
        ScreenshotItem.isSerialized({ base64: './screenshots/test.png' }),
      ).toBe(true);
      expect(
        ScreenshotItem.isSerialized({ base64: 'data:image/png;base64,abc' }),
      ).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(ScreenshotItem.isSerialized({})).toBe(false);
      expect(ScreenshotItem.isSerialized({ screenshot: 'id' })).toBe(false);
      expect(ScreenshotItem.isSerialized({ $screenshot: 123 })).toBe(false);
      expect(ScreenshotItem.isSerialized({ base64: 123 })).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(ScreenshotItem.isSerialized(null)).toBe(false);
      expect(ScreenshotItem.isSerialized(undefined)).toBe(false);
      expect(ScreenshotItem.isSerialized('string')).toBe(false);
      expect(ScreenshotItem.isSerialized(123)).toBe(false);
      expect(ScreenshotItem.isSerialized([])).toBe(false);
    });
  });

  describe('rawBase64', () => {
    it('should strip data URI prefix from PNG', () => {
      const item = ScreenshotItem.create(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
      );
      expect(item.rawBase64).toBe('iVBORw0KGgoAAAANSUhEUgAAAAUA');
    });

    it('should strip data URI prefix from JPEG', () => {
      const item = ScreenshotItem.create('data:image/jpeg;base64,/9j/4AAQ');
      expect(item.rawBase64).toBe('/9j/4AAQ');
    });

    it('should strip data URI prefix from JPG', () => {
      const item = ScreenshotItem.create('data:image/jpg;base64,/9j/4AAQ');
      expect(item.rawBase64).toBe('/9j/4AAQ');
    });

    it('should return unchanged if no prefix', () => {
      const item = ScreenshotItem.create('iVBORw0KGgoAAAANSUhEUgAAAAUA');
      expect(item.rawBase64).toBe('iVBORw0KGgoAAAANSUhEUgAAAAUA');
    });

    it('should throw when no recovery path available after release', () => {
      // This tests the edge case where a ScreenshotItem is created but
      // memory is released without a valid recovery path (shouldn't happen in practice)
      const item = ScreenshotItem.create(testBase64);
      // Simulate an invalid state by providing non-existent HTML path
      item.markPersistedInline('/non-existent-path.html');
      // Should throw because the HTML file doesn't exist
      expect(() => item.rawBase64).toThrow();
    });
  });

  describe('id and base64', () => {
    it('should have unique id for each instance', () => {
      const item1 = ScreenshotItem.create(testBase64);
      const item2 = ScreenshotItem.create(testBase64);
      expect(item1.id).not.toBe(item2.id);
    });

    it('should preserve base64 data through toSerializable', () => {
      const item = ScreenshotItem.create(testBase64);
      const serialized = item.toSerializable();
      expect((serialized as { $screenshot: string }).$screenshot).toBe(item.id);
      expect(item.base64).toBe(testBase64);
    });
  });

  describe('persistence and memory release', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `midscene-screenshot-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should have base64 available before persistence', () => {
      const item = ScreenshotItem.create(testBase64);
      expect(item.hasBase64()).toBe(true);
      expect(item.base64).toBe(testBase64);
    });

    it('markPersistedInline should release memory and support lazy loading recovery', () => {
      const item = ScreenshotItem.create(testBase64);
      const id = item.id;

      // Create a temporary HTML file with the screenshot data
      const htmlPath = join(tmpDir, 'test.html');
      writeFileSync(
        htmlPath,
        `<script type="midscene-image" data-id="${id}">${testBase64}</script>`,
      );

      item.markPersistedInline(htmlPath);

      expect(item.hasBase64()).toBe(false);
      // Should recover from HTML file via lazy loading
      expect(item.base64).toBe(testBase64);
      expect(item.toSerializable()).toEqual({ $screenshot: id });
    });

    it('markPersistedToPath should release memory and support lazy loading recovery', () => {
      const item = ScreenshotItem.create(testBase64);
      const relativePath = './screenshots/test-id.png';
      const absolutePath = join(tmpDir, 'test-id.png');

      // Write PNG file (just the base64 data decoded)
      const rawBase64 = testBase64.replace(/^data:image\/png;base64,/, '');
      writeFileSync(absolutePath, Buffer.from(rawBase64, 'base64'));

      item.markPersistedToPath(relativePath, absolutePath);

      expect(item.hasBase64()).toBe(false);
      // Should recover from PNG file via lazy loading
      expect(item.base64).toContain('data:image/png;base64,');
      expect(item.toSerializable()).toEqual({ base64: relativePath });
    });

    it('toSerializable should return $screenshot format before persistence', () => {
      const item = ScreenshotItem.create(testBase64);
      const serialized = item.toSerializable();

      expect(serialized).toHaveProperty('$screenshot');
      expect((serialized as { $screenshot: string }).$screenshot).toBe(item.id);
    });

    it('should throw when recovery path does not exist (directory mode)', () => {
      const item = ScreenshotItem.create(testBase64);
      item.markPersistedToPath(
        './screenshots/non-existent.png',
        '/non-existent-path.png',
      );
      expect(item.hasBase64()).toBe(false);
      expect(() => item.base64).toThrow();
    });

    it('should throw when recovery HTML does not contain the image (inline mode)', () => {
      const item = ScreenshotItem.create(testBase64);
      const htmlPath = join(tmpDir, 'empty.html');
      writeFileSync(htmlPath, '<html></html>');

      item.markPersistedInline(htmlPath);
      expect(item.hasBase64()).toBe(false);
      expect(() => item.base64).toThrow(/cannot recover/);
    });
  });
});
