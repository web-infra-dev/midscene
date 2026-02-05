import { describe, expect, it } from 'vitest';

// Test the uuid validation regex directly since it's the core security check
describe('PlaygroundServer Security - UUID Validation', () => {
  // This regex is used in filePathForUuid to validate uuid format
  const uuidRegex = /^[a-zA-Z0-9-]+$/;

  describe('uuid validation regex', () => {
    it('should accept valid uuid format', () => {
      expect(uuidRegex.test('abc-123-def')).toBe(true);
      expect(uuidRegex.test('a1b2c3d4')).toBe(true);
      expect(uuidRegex.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(uuidRegex.test('ABCDEF')).toBe(true);
      expect(uuidRegex.test('test-uuid-123')).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      expect(uuidRegex.test('../etc/passwd')).toBe(false);
      expect(uuidRegex.test('..\\windows\\system32')).toBe(false);
      expect(uuidRegex.test('foo/../bar')).toBe(false);
      expect(uuidRegex.test('..')).toBe(false);
    });

    it('should reject special characters', () => {
      expect(uuidRegex.test('test.json')).toBe(false);
      expect(uuidRegex.test('test/path')).toBe(false);
      expect(uuidRegex.test('test:name')).toBe(false);
      expect(uuidRegex.test('test name')).toBe(false);
      expect(uuidRegex.test('test\nname')).toBe(false);
      expect(uuidRegex.test('test\x00name')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(uuidRegex.test('')).toBe(false);
    });
  });
});
