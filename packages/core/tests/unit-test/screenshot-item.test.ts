import { beforeEach, describe, expect, it } from 'vitest';
import { ScreenshotItem } from '../../src/screenshot-item';
import { MemoryStorage } from '../../src/storage';

describe('ScreenshotItem', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe('create', () => {
    it('should create a ScreenshotItem with base64 data', async () => {
      const base64 = 'data:image/png;base64,abc123';
      const item = await ScreenshotItem.create(base64, storage);

      expect(item).toBeInstanceOf(ScreenshotItem);
      expect(item.id).toBeDefined();
      expect(await item.getData()).toBe(base64);
    });

    it('should generate unique IDs for different items', async () => {
      const item1 = await ScreenshotItem.create('data1', storage);
      const item2 = await ScreenshotItem.create('data2', storage);

      expect(item1.id).not.toBe(item2.id);
    });
  });

  describe('restore', () => {
    it('should restore a ScreenshotItem from ID', async () => {
      const base64 = 'data:image/png;base64,xyz789';
      const original = await ScreenshotItem.create(base64, storage);

      const restored = ScreenshotItem.restore(original.id, storage);
      expect(await restored.getData()).toBe(base64);
    });
  });

  describe('toSerializable', () => {
    it('should return serializable format', async () => {
      const item = await ScreenshotItem.create('test-data', storage);
      const serialized = item.toSerializable();

      expect(serialized).toEqual({ $screenshot: item.id });
    });
  });

  describe('isSerialized', () => {
    it('should detect serialized format', () => {
      expect(ScreenshotItem.isSerialized({ $screenshot: 'id123' })).toBe(true);
      expect(ScreenshotItem.isSerialized({ other: 'data' })).toBe(false);
      expect(ScreenshotItem.isSerialized('string')).toBe(false);
      expect(ScreenshotItem.isSerialized(null)).toBe(false);
    });
  });
});

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe('store and retrieve', () => {
    it('should store and retrieve data', async () => {
      const id = await storage.store('test-data');
      const retrieved = await storage.retrieve(id);

      expect(retrieved).toBe('test-data');
    });

    it('should throw error for non-existent ID', async () => {
      await expect(storage.retrieve('non-existent')).rejects.toThrow();
    });
  });

  describe('storeWithId', () => {
    it('should store data with specific ID', async () => {
      await storage.storeWithId('custom-id', 'custom-data');
      const retrieved = await storage.retrieve('custom-id');

      expect(retrieved).toBe('custom-data');
    });
  });

  describe('cleanup', () => {
    it('should clear all stored data', async () => {
      const id = await storage.store('test-data');
      await storage.cleanup();

      await expect(storage.retrieve(id)).rejects.toThrow();
    });
  });
});
