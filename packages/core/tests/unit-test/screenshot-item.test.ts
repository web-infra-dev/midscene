import { MemoryStorage } from '@/storage';
import { describe, expect, it } from 'vitest';
import { ScreenshotItem } from '../../src/screenshot-item';

describe('ScreenshotItem', () => {
  const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';

  describe('create', () => {
    it('should create a ScreenshotItem from base64 string', async () => {
      const item = await ScreenshotItem.create(testBase64);
      expect(item).toBeInstanceOf(ScreenshotItem);
      const data = await item.getData();
      expect(data).toBe(testBase64);
    });
  });

  describe('getData', () => {
    it('should return the base64 data', async () => {
      const item = await ScreenshotItem.create(testBase64);
      const data = await item.getData();
      expect(data).toBe(testBase64);
    });
  });

  describe('toSerializable', () => {
    it('should return an object with $screenshot property', async () => {
      const item = await ScreenshotItem.create(testBase64);
      const serialized = item.toSerializable();
      expect(serialized).toHaveProperty('$screenshot');
      expect(typeof serialized.$screenshot).toBe('string');
    });

    it('should produce JSON-serializable output', async () => {
      const item = await ScreenshotItem.create(testBase64);
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

  describe('restore', () => {
    it('should restore from id and provider', async () => {
      const provider = new MemoryStorage();
      const original = await ScreenshotItem.create(testBase64, provider);
      const serialized = original.toSerializable();

      const restored = ScreenshotItem.restore(serialized.$screenshot, provider);
      expect(restored).toBeInstanceOf(ScreenshotItem);
      const restoredData = await restored.getData();
      const originalData = await original.getData();
      expect(restoredData).toBe(originalData);
    });

    it('should be the counterpart of toSerializable', async () => {
      const provider = new MemoryStorage();
      const original = await ScreenshotItem.create(testBase64, provider);
      const serialized = original.toSerializable();
      const restored = ScreenshotItem.restore(serialized.$screenshot, provider);

      expect(restored).toBeInstanceOf(ScreenshotItem);
      const restoredData = await restored.getData();
      const originalData = await original.getData();
      expect(restoredData).toBe(originalData);
    });
  });

  describe('isSerialized', () => {
    it('should return true for valid serialized objects', () => {
      expect(ScreenshotItem.isSerialized({ $screenshot: 'test-id' })).toBe(
        true,
      );
      expect(ScreenshotItem.isSerialized({ $screenshot: 'another-id' })).toBe(
        true,
      );
    });

    it('should return false for invalid objects', () => {
      expect(ScreenshotItem.isSerialized({})).toBe(false);
      expect(ScreenshotItem.isSerialized({ screenshot: 'id' })).toBe(false);
      expect(ScreenshotItem.isSerialized({ $screenshot: 123 })).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(ScreenshotItem.isSerialized(null)).toBe(false);
      expect(ScreenshotItem.isSerialized(undefined)).toBe(false);
      expect(ScreenshotItem.isSerialized('string')).toBe(false);
      expect(ScreenshotItem.isSerialized(123)).toBe(false);
      expect(ScreenshotItem.isSerialized([])).toBe(false);
    });
  });

  describe('round-trip serialization', () => {
    it('should preserve data through create -> toSerializable -> restore cycle', async () => {
      const provider = new MemoryStorage();
      const original = await ScreenshotItem.create(testBase64, provider);
      const serialized = original.toSerializable();
      const restored = ScreenshotItem.restore(serialized.$screenshot, provider);

      const restoredData = await restored.getData();
      const originalData = await original.getData();
      expect(restoredData).toBe(originalData);
    });
  });

  describe('serialize', () => {
    it('should serialize to inline format with base64 data', async () => {
      const item = await ScreenshotItem.create(testBase64);
      const serialized = await item.serialize('inline');

      expect(serialized).toEqual({
        type: 'inline',
        data: testBase64,
      });
    });

    it('should serialize to file format with path', async () => {
      const item = await ScreenshotItem.create(testBase64);
      const filePath = './screenshots/test.png';
      const serialized = await item.serialize('file', filePath);

      expect(serialized).toEqual({
        type: 'file',
        path: filePath,
      });
    });

    it('should throw error when file mode is used without filePath', async () => {
      const item = await ScreenshotItem.create(testBase64);

      await expect(
        (item as any).serialize('file', undefined),
      ).rejects.toThrow('filePath is required for file mode serialization');
    });
  });

  describe('isSerializedScreenshot', () => {
    it('should return true for valid inline format', () => {
      expect(
        ScreenshotItem.isSerializedScreenshot({ type: 'inline', data: 'base64data' }),
      ).toBe(true);
    });

    it('should return true for valid file format', () => {
      expect(
        ScreenshotItem.isSerializedScreenshot({ type: 'file', path: './screenshots/test.png' }),
      ).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(ScreenshotItem.isSerializedScreenshot({})).toBe(false);
      expect(ScreenshotItem.isSerializedScreenshot({ type: 'inline' })).toBe(false);
      expect(ScreenshotItem.isSerializedScreenshot({ type: 'file' })).toBe(false);
      expect(ScreenshotItem.isSerializedScreenshot({ type: 'unknown', data: 'test' })).toBe(false);
      expect(ScreenshotItem.isSerializedScreenshot({ data: 'test' })).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(ScreenshotItem.isSerializedScreenshot(null)).toBe(false);
      expect(ScreenshotItem.isSerializedScreenshot(undefined)).toBe(false);
      expect(ScreenshotItem.isSerializedScreenshot('string')).toBe(false);
      expect(ScreenshotItem.isSerializedScreenshot(123)).toBe(false);
    });
  });
});
