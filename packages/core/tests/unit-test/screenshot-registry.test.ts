import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IMAGE_REF_PREFIX,
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

  describe('buildReference', () => {
    it('should build a valid image reference', () => {
      const id = registry.register('data:image/png;base64,test');
      const reference = registry.buildReference(id);

      expect(reference).toBe(`${IMAGE_REF_PREFIX}test-group-img-0`);
    });
  });

  describe('static methods', () => {
    it('isImageReference should identify valid references', () => {
      expect(
        ScreenshotRegistry.isImageReference('#midscene-img:test-img-0'),
      ).toBe(true);
      expect(
        ScreenshotRegistry.isImageReference('data:image/png;base64,test'),
      ).toBe(false);
      expect(ScreenshotRegistry.isImageReference(null)).toBe(false);
      expect(ScreenshotRegistry.isImageReference(123)).toBe(false);
    });

    it('extractIdFromReference should extract the ID', () => {
      const id = ScreenshotRegistry.extractIdFromReference(
        '#midscene-img:test-group-img-5',
      );
      expect(id).toBe('test-group-img-5');
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
});
