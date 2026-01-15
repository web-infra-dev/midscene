import { describe, expect, it } from 'vitest';
import { ScreenshotItem } from '../../src/screenshot-item';

describe('ScreenshotItem', () => {
  const testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';

  describe('create', () => {
    it('should create a ScreenshotItem from base64 string', () => {
      const item = ScreenshotItem.create(testBase64);
      expect(item).toBeInstanceOf(ScreenshotItem);
      expect(item.getData()).toBe(testBase64);
    });
  });

  describe('getData', () => {
    it('should return the base64 data', () => {
      const item = ScreenshotItem.create(testBase64);
      expect(item.getData()).toBe(testBase64);
    });
  });

  describe('toSerializable', () => {
    it('should return the base64 string for serialization', () => {
      const item = ScreenshotItem.create(testBase64);
      expect(item.toSerializable()).toBe(testBase64);
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
      expect(parsed.screenshot).toBe(testBase64);
    });
  });

  describe('fromSerializedData', () => {
    it('should deserialize from base64 string', () => {
      const item = ScreenshotItem.fromSerializedData(testBase64);
      expect(item).toBeInstanceOf(ScreenshotItem);
      expect(item.getData()).toBe(testBase64);
    });

    it('should be the counterpart of toSerializable', () => {
      const original = ScreenshotItem.create(testBase64);
      const serialized = original.toSerializable();
      const deserialized = ScreenshotItem.fromSerializedData(serialized);

      expect(deserialized).toBeInstanceOf(ScreenshotItem);
      expect(deserialized.getData()).toBe(original.getData());
    });
  });

  describe('isSerializedData', () => {
    it('should return true for non-empty strings', () => {
      expect(ScreenshotItem.isSerializedData(testBase64)).toBe(true);
      expect(ScreenshotItem.isSerializedData('any-string')).toBe(true);
    });

    it('should return false for empty strings', () => {
      expect(ScreenshotItem.isSerializedData('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(ScreenshotItem.isSerializedData(null)).toBe(false);
      expect(ScreenshotItem.isSerializedData(undefined)).toBe(false);
      expect(ScreenshotItem.isSerializedData(123)).toBe(false);
      expect(ScreenshotItem.isSerializedData({})).toBe(false);
      expect(ScreenshotItem.isSerializedData([])).toBe(false);
    });
  });

  describe('round-trip serialization', () => {
    it('should preserve data through create -> toSerializable -> fromSerializedData cycle', () => {
      const original = ScreenshotItem.create(testBase64);
      const serialized = original.toSerializable();
      const restored = ScreenshotItem.fromSerializedData(serialized);

      expect(restored.getData()).toBe(original.getData());
    });
  });
});
