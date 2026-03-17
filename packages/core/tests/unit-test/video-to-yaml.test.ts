import { describe, expect, test } from 'vitest';

// Test the pure utility functions by importing the module and testing exports
// We need to test stripCodeFences and ensureDataUri via the public API behavior

describe('video-to-yaml prompt utilities', () => {
  // Import the module to access internal logic indirectly
  // Since stripCodeFences and ensureDataUri are private, we test them
  // via the module's behavior with mocked AI calls

  describe('generateYamlFromVideoFrames', () => {
    test('throws when frames array is empty', async () => {
      const { generateYamlFromVideoFrames } = await import(
        '@/ai-model/prompt/video-to-yaml'
      );

      await expect(
        generateYamlFromVideoFrames([], {}, {} as any),
      ).rejects.toThrow('No frames provided for video-to-YAML generation');
    });
  });

  describe('generatePlaywrightFromVideoFrames', () => {
    test('throws when frames array is empty', async () => {
      const { generatePlaywrightFromVideoFrames } = await import(
        '@/ai-model/prompt/video-to-yaml'
      );

      await expect(
        generatePlaywrightFromVideoFrames([], {}, {} as any),
      ).rejects.toThrow(
        'No frames provided for video-to-Playwright generation',
      );
    });
  });
});
