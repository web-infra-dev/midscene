import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IMAGE_SCRIPT_TYPE,
  ScreenshotRegistry,
} from '../../src/screenshot-registry';

describe('ScreenshotRegistry', () => {
  let registry: ScreenshotRegistry;

  beforeEach(() => {
    registry = new ScreenshotRegistry('test-group');
  });

  afterEach(() => {
    registry.cleanup();
  });

  describe('register', () => {
    it('should register a screenshot and return an ID', () => {
      const base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
      const id = registry.register(base64);

      expect(id).toBe('test-group-img-0');
      expect(registry.size).toBe(1);
    });

    it('should increment IDs for multiple screenshots', () => {
      const base64 = 'data:image/png;base64,test';

      const id1 = registry.register(base64);
      const id2 = registry.register(base64);
      const id3 = registry.register(base64);

      expect(id1).toBe('test-group-img-0');
      expect(id2).toBe('test-group-img-1');
      expect(id3).toBe('test-group-img-2');
      expect(registry.size).toBe(3);
    });

    it('should sanitize group ID with special characters', () => {
      const specialRegistry = new ScreenshotRegistry(
        'test/group:with<special>chars',
      );
      const id = specialRegistry.register('data:image/png;base64,test');

      expect(id).toMatch(/^test_group_with_special_chars-img-0$/);
      specialRegistry.cleanup();
    });
  });

  describe('get', () => {
    it('should retrieve registered screenshot data', () => {
      const base64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
      const id = registry.register(base64);

      const retrieved = registry.get(id);
      expect(retrieved).toBe(base64);
    });

    it('should return undefined for non-existent ID', () => {
      const retrieved = registry.get('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('generateScriptTags', () => {
    it('should generate script tags for all screenshots', () => {
      const base64_1 = 'data:image/png;base64,first';
      const base64_2 = 'data:image/png;base64,second';

      registry.register(base64_1);
      registry.register(base64_2);

      const scriptTags = registry.generateScriptTags();

      expect(scriptTags).toContain(`type="${IMAGE_SCRIPT_TYPE}"`);
      expect(scriptTags).toContain('data-id="test-group-img-0"');
      expect(scriptTags).toContain('data-id="test-group-img-1"');
      expect(scriptTags).toContain(base64_1);
      expect(scriptTags).toContain(base64_2);
    });

    it('should return empty string when no screenshots registered', () => {
      const scriptTags = registry.generateScriptTags();
      expect(scriptTags).toBe('');
    });

    it('should escape script tags in base64 content', () => {
      const base64WithScript =
        'data:image/png;base64,</script><script>alert(1)';
      registry.register(base64WithScript);

      const scriptTags = registry.generateScriptTags();

      // escapeScriptTag replaces < with __midscene_lt__ and > with __midscene_gt__
      expect(scriptTags).not.toContain('</script><script>alert');
      expect(scriptTags).toContain('__midscene_lt__');
      expect(scriptTags).toContain('__midscene_gt__');
    });
  });

  describe('cleanup', () => {
    it('should remove temp files and clear registry', () => {
      registry.register('data:image/png;base64,test1');
      registry.register('data:image/png;base64,test2');

      expect(registry.size).toBe(2);

      registry.cleanup();

      expect(registry.size).toBe(0);
      expect(registry.isEmpty).toBe(true);
    });

    it('should be safe to call multiple times', () => {
      registry.register('data:image/png;base64,test');

      registry.cleanup();
      registry.cleanup();
      registry.cleanup();

      expect(registry.size).toBe(0);
    });
  });

  describe('getIds', () => {
    it('should return all registered IDs', () => {
      registry.register('data:image/png;base64,test1');
      registry.register('data:image/png;base64,test2');

      const ids = registry.getIds();

      expect(ids).toEqual(['test-group-img-0', 'test-group-img-1']);
    });
  });

  describe('edge cases', () => {
    it('should handle empty base64 string', () => {
      const id = registry.register('');
      expect(id).toBe('test-group-img-0');
      expect(registry.get(id)).toBe('');
    });

    it('should handle very long group names by truncating', () => {
      const longGroupName = 'a'.repeat(100);
      const longRegistry = new ScreenshotRegistry(longGroupName);
      const id = longRegistry.register('data:image/png;base64,test');

      // Should be truncated to 64 characters
      expect(id.startsWith('a'.repeat(64))).toBe(true);
      expect(id).toMatch(/-img-0$/);

      longRegistry.cleanup();
    });

    it('should handle unicode characters in group name', () => {
      const unicodeRegistry = new ScreenshotRegistry('测试组名-テスト');
      const id = unicodeRegistry.register('data:image/png;base64,test');

      // Unicode characters should be replaced with underscores
      expect(id).not.toContain('测试');
      expect(id).not.toContain('テスト');
      expect(id).toMatch(/-img-0$/);

      unicodeRegistry.cleanup();
    });

    it('should handle large base64 data', () => {
      // Create a 1MB base64 string
      const largeData = `data:image/png;base64,${'A'.repeat(1024 * 1024)}`;
      const id = registry.register(largeData);

      const retrieved = registry.get(id);
      expect(retrieved).toBe(largeData);
    });

    it('should not be usable after cleanup (cleanup is destructive)', () => {
      registry.register('data:image/png;base64,first');
      registry.cleanup();

      // After cleanup, the registry is cleared and temp directory is deleted
      // Attempting to register again will fail
      // This is expected behavior - use a new registry after cleanup
      expect(registry.size).toBe(0);
      expect(registry.isEmpty).toBe(true);
    });
  });

  describe('temp file management', () => {
    it('should create temp files in system temp directory', () => {
      const id = registry.register('data:image/png;base64,test');

      // Verify the temp file exists by being able to get the data
      const retrieved = registry.get(id);
      expect(retrieved).toBe('data:image/png;base64,test');
    });

    it('should handle concurrent registrations', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve(registry.register(`data:image/png;base64,test${i}`)),
        );
      }

      const ids = await Promise.all(promises);

      // All IDs should be unique
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds.length).toBe(10);

      // All data should be retrievable
      ids.forEach((id, index) => {
        expect(registry.get(id)).toBe(`data:image/png;base64,test${index}`);
      });
    });
  });

  describe('multiple registry instances', () => {
    it('should maintain separate namespaces for different registries', () => {
      const registry1 = new ScreenshotRegistry('group-1');
      const registry2 = new ScreenshotRegistry('group-2');

      const id1 = registry1.register('data:image/png;base64,test1');
      const id2 = registry2.register('data:image/png;base64,test2');

      expect(id1).toBe('group-1-img-0');
      expect(id2).toBe('group-2-img-0');

      // Each registry should only contain its own data
      expect(registry1.get(id1)).toBe('data:image/png;base64,test1');
      expect(registry1.get(id2)).toBeUndefined();
      expect(registry2.get(id2)).toBe('data:image/png;base64,test2');
      expect(registry2.get(id1)).toBeUndefined();

      registry1.cleanup();
      registry2.cleanup();
    });

    it('should generate non-conflicting script tags from multiple registries', () => {
      const registry1 = new ScreenshotRegistry('group-1');
      const registry2 = new ScreenshotRegistry('group-2');

      registry1.register('data:image/png;base64,test1');
      registry2.register('data:image/png;base64,test2');

      const tags1 = registry1.generateScriptTags();
      const tags2 = registry2.generateScriptTags();

      expect(tags1).toContain('data-id="group-1-img-0"');
      expect(tags2).toContain('data-id="group-2-img-0"');

      // Combined tags should have unique IDs
      const combined = tags1 + tags2;
      expect(combined).toContain('group-1-img-0');
      expect(combined).toContain('group-2-img-0');

      registry1.cleanup();
      registry2.cleanup();
    });
  });
});
