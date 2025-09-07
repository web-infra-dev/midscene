import { describe, expect, test, vi } from 'vitest';

// Mock dependencies
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue('mock api documentation content'),
  },
}));

vi.mock('node:path', () => ({
  default: {
    join: vi.fn().mockReturnValue('/mocked/path/api.mdx'),
  },
}));

vi.mock('@midscene/shared/constants', () => ({
  PLAYWRIGHT_EXAMPLE_CODE: 'mock playwright example code',
}));

describe('Prompts Module', () => {
  test('should export PROMPTS object with required properties', async () => {
    // Dynamic import to ensure mocks are applied
    const { PROMPTS } = await import('../src/prompts');

    expect(PROMPTS).toBeDefined();
    expect(PROMPTS.PLAYWRIGHT_CODE_EXAMPLE).toBe(
      'mock playwright example code',
    );
    expect(PROMPTS.MIDSCENE_API_DOCS).toBe('mock api documentation content');
  });

  test('should read API documentation from correct path', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    // Import to trigger the module loading
    await import('../src/prompts');

    expect(path.default.join).toHaveBeenCalledWith(
      expect.any(String),
      'api.mdx',
    );
    expect(fs.default.readFileSync).toHaveBeenCalledWith(
      '/mocked/path/api.mdx',
      'utf-8',
    );
  });
});
