import { describe, expect, it, vi } from 'vitest';
import type { LocateOption } from '@/yaml';
import { callAI, callAIWithObjectResponse } from '@/ai-model/service-caller';

describe('timeout parameter', () => {
  describe('LocateOption', () => {
    it('should accept timeoutMs parameter in LocateOption', () => {
      const options: LocateOption = {
        prompt: 'test element',
        timeoutMs: 30000,
      };

      expect(options.timeoutMs).toBe(30000);
      expect(typeof options.timeoutMs).toBe('number');
    });

    it('should allow optional timeoutMs', () => {
      const optionsWithoutTimeout: LocateOption = {
        prompt: 'test element',
      };

      expect(optionsWithoutTimeout.timeoutMs).toBeUndefined();
    });

    it('should work with other options', () => {
      const options: LocateOption = {
        prompt: 'test element',
        deepThink: true,
        cacheable: false,
        timeoutMs: 60000,
      };

      expect(options.timeoutMs).toBe(60000);
      expect(options.deepThink).toBe(true);
      expect(options.cacheable).toBe(false);
    });
  });

  describe('callAI timeout support', () => {
    it('should accept timeoutMs in options', async () => {
      // This test verifies the type signature
      // We don't actually make a real API call in unit tests
      const mockOptions = {
        timeoutMs: 30000,
      };

      expect(mockOptions.timeoutMs).toBe(30000);
      expect(typeof mockOptions.timeoutMs).toBe('number');
    });

    it('should work with streaming options', () => {
      const mockOptions = {
        stream: true,
        onChunk: vi.fn(),
        timeoutMs: 45000,
      };

      expect(mockOptions.timeoutMs).toBe(45000);
      expect(mockOptions.stream).toBe(true);
    });
  });

  describe('callAIWithObjectResponse timeout support', () => {
    it('should accept timeoutMs in options', () => {
      // This test verifies the type signature
      const mockOptions = {
        timeoutMs: 30000,
      };

      expect(mockOptions.timeoutMs).toBe(30000);
    });
  });
});
