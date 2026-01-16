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

  describe('getData (deprecated)', () => {
    it('should return the base64 data for backward compatibility', () => {
      const item = ScreenshotItem.create(testBase64);
      expect(item.getData()).toBe(testBase64);
    });
  });

  describe('toSerializable', () => {
    it('should return an object with base64 property for serialization', () => {
      const item = ScreenshotItem.create(testBase64);
      expect(item.toSerializable()).toEqual({ base64: testBase64 });
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
      expect(parsed.screenshot).toEqual({ base64: testBase64 });
      expect(parsed.screenshot.base64).toBe(testBase64);
    });
  });

  describe('fromSerializedData', () => {
    it('should deserialize from SerializedScreenshotItem', () => {
      const item = ScreenshotItem.fromSerializedData({ base64: testBase64 });
      expect(item).toBeInstanceOf(ScreenshotItem);
      expect(item.base64).toBe(testBase64);
    });

    it('should be the counterpart of toSerializable', () => {
      const original = ScreenshotItem.create(testBase64);
      const serialized = original.toSerializable();
      const deserialized = ScreenshotItem.fromSerializedData(serialized);

      expect(deserialized).toBeInstanceOf(ScreenshotItem);
      expect(deserialized.base64).toBe(original.base64);
    });
  });

  describe('isSerializedData', () => {
    it('should return true for objects with base64 property', () => {
      expect(ScreenshotItem.isSerializedData({ base64: testBase64 })).toBe(
        true,
      );
      expect(ScreenshotItem.isSerializedData({ base64: 'any-string' })).toBe(
        true,
      );
    });

    it('should return false for objects without base64 property', () => {
      expect(ScreenshotItem.isSerializedData({})).toBe(false);
      expect(ScreenshotItem.isSerializedData({ data: testBase64 })).toBe(false);
    });

    it('should return false for objects with non-string base64 property', () => {
      expect(ScreenshotItem.isSerializedData({ base64: 123 })).toBe(false);
      expect(ScreenshotItem.isSerializedData({ base64: null })).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(ScreenshotItem.isSerializedData(null)).toBe(false);
      expect(ScreenshotItem.isSerializedData(undefined)).toBe(false);
      expect(ScreenshotItem.isSerializedData(123)).toBe(false);
      expect(ScreenshotItem.isSerializedData('string')).toBe(false);
      expect(ScreenshotItem.isSerializedData([])).toBe(false);
    });
  });

  describe('round-trip serialization', () => {
    it('should preserve data through create -> toSerializable -> fromSerializedData cycle', () => {
      const original = ScreenshotItem.create(testBase64);
      const serialized = original.toSerializable();
      const restored = ScreenshotItem.fromSerializedData(serialized);

      expect(restored.base64).toBe(original.base64);
    });

    it('should allow easy access to base64 from serialized JSON', () => {
      const original = ScreenshotItem.create(testBase64);
      const jsonString = JSON.stringify(original.toSerializable());
      const parsed = JSON.parse(jsonString);

      // After serialization, the data is easily accessible
      expect(parsed.base64).toBe(testBase64);
    });
  });
});
