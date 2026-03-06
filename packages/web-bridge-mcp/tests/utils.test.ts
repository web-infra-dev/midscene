import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { deepMerge } from '../src/utils';

// Mock external dependencies
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('@midscene/shared/env', () => ({
  MIDSCENE_MCP_CHROME_PATH: 'MIDSCENE_MCP_CHROME_PATH',
  globalConfigManager: {
    getEnvConfigValue: vi.fn(),
  },
}));

describe('Utils Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deepMerge', () => {
    test('should merge simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    test('should merge nested objects', () => {
      const target = { nested: { a: 1, b: 2 }, other: 'value' };
      const source = { nested: { b: 3, c: 4 } };
      const result = deepMerge(target, source);

      expect(result).toEqual({
        nested: { a: 1, b: 3, c: 4 },
        other: 'value',
      });
    });

    test('should handle arrays with deduplication for args', () => {
      const target = { args: ['--flag1=value1', '--flag2'] };
      const source = { args: ['--flag1=newvalue', '--flag3'] };
      const result = deepMerge(target, source);

      expect(result.args).toContain('--flag1=newvalue');
      expect(result.args).toContain('--flag2');
      expect(result.args).toContain('--flag3');
      expect(result.args).not.toContain('--flag1=value1');
    });

    test('should handle non-object inputs', () => {
      expect(deepMerge('string', 'newstring')).toBe('newstring');
      expect(deepMerge({ a: 1 }, 'string')).toBe('string');
      expect(deepMerge({ a: 1 }, undefined)).toBe(undefined);
    });
  });
});
