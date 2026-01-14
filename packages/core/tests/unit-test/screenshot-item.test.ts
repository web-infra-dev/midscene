import { describe, expect, it } from 'vitest';
import { ScreenshotItem } from '../../src/screenshot-item';
import { stringifyDumpData } from '../../src/utils';

describe('ScreenshotItem', () => {
  describe('create', () => {
    it('should create a ScreenshotItem with base64 data', () => {
      const base64 = 'data:image/png;base64,abc123';
      const item = ScreenshotItem.create(base64);

      expect(item).toBeInstanceOf(ScreenshotItem);
      expect(item.getData()).toBe(base64);
    });

    it('should create multiple independent items', () => {
      const base64_1 = 'data:image/png;base64,data1';
      const base64_2 = 'data:image/png;base64,data2';

      const item1 = ScreenshotItem.create(base64_1);
      const item2 = ScreenshotItem.create(base64_2);

      expect(item1.getData()).toBe(base64_1);
      expect(item2.getData()).toBe(base64_2);
      expect(item1.getData()).not.toBe(item2.getData());
    });
  });

  describe('getData', () => {
    it('should return the base64 data synchronously', () => {
      const base64 = 'data:image/png;base64,xyz789';
      const item = ScreenshotItem.create(base64);

      const data = item.getData();
      expect(data).toBe(base64);
      expect(typeof data).toBe('string');
    });
  });

  describe('toSerializable', () => {
    it('should return base64 string directly', () => {
      const base64 = 'data:image/png;base64,test-data';
      const item = ScreenshotItem.create(base64);
      const serialized = item.toSerializable();

      expect(serialized).toBe(base64);
      expect(typeof serialized).toBe('string');
    });
  });

  describe('serialization with stringifyDumpData', () => {
    it('should serialize ScreenshotItem to base64 string in JSON', () => {
      const base64 = 'data:image/png;base64,serialization-test';
      const screenshot = ScreenshotItem.create(base64);

      const data = {
        screenshot,
        nested: {
          screenshot,
        },
      };

      const serialized = stringifyDumpData(data);
      const parsed = JSON.parse(serialized);

      // After serialization and parsing, screenshots should be plain strings
      expect(typeof parsed.screenshot).toBe('string');
      expect(parsed.screenshot).toBe(base64);
      expect(typeof parsed.nested.screenshot).toBe('string');
      expect(parsed.nested.screenshot).toBe(base64);
    });

    it('should handle arrays of ScreenshotItems', () => {
      const base64_1 = 'data:image/png;base64,array-test-1';
      const base64_2 = 'data:image/png;base64,array-test-2';

      const data = {
        screenshots: [
          ScreenshotItem.create(base64_1),
          ScreenshotItem.create(base64_2),
        ],
      };

      const serialized = stringifyDumpData(data);
      const parsed = JSON.parse(serialized);

      expect(Array.isArray(parsed.screenshots)).toBe(true);
      expect(parsed.screenshots.length).toBe(2);
      expect(parsed.screenshots[0]).toBe(base64_1);
      expect(parsed.screenshots[1]).toBe(base64_2);
    });
  });
});
