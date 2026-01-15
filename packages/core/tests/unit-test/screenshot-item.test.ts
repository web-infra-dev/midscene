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
});
