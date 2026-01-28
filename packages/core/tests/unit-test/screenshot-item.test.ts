import { describe, expect, it } from 'vitest';
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
      expect(typeof serialized.$screenshot).toBe('string');
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

  describe('id and base64', () => {
    it('should have unique id for each instance', () => {
      const item1 = ScreenshotItem.create(testBase64);
      const item2 = ScreenshotItem.create(testBase64);
      expect(item1.id).not.toBe(item2.id);
    });

    it('should preserve base64 data through toSerializable', () => {
      const item = ScreenshotItem.create(testBase64);
      const serialized = item.toSerializable();
      expect(serialized.$screenshot).toBe(item.id);
      expect(item.base64).toBe(testBase64);
    });
  });
});
