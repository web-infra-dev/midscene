import {
  generateRecorderYamlTest,
  generateRecorderYamlTestStream,
} from '@midscene/core/ai-model';
import type { IModelConfig } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';
import {
  generateYamlTest,
  generateYamlTestStream,
} from '../src/extension/recorder/generators/yamlGenerator';

vi.mock('@midscene/core/ai-model', () => ({
  generateRecorderYamlTest: vi.fn(
    async () => 'web:\n  url: "https://example.com"\n',
  ),
  generateRecorderYamlTestStream: vi.fn(async () => ({
    content: 'web:\n  url: "https://example.com"\n',
    usage: undefined,
    isStreamed: true,
  })),
}));

vi.mock('../src/extension/recorder/logger', () => ({
  recordLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockedModelConfig = {
  modelName: 'mock',
  modelDescription: 'mock',
  intent: 'default',
  slot: 'default',
} as const satisfies IModelConfig;

describe('chrome extension recorder YAML generator', () => {
  it('passes a web recorder target to core YAML generation', async () => {
    await generateYamlTest(
      [
        {
          type: 'navigation',
          url: 'https://example.com',
          title: 'Example',
          pageInfo: { width: 1280, height: 720 },
          timestamp: 1,
          hashId: 'nav-1',
        },
      ],
      { testName: 'extension recording' },
      mockedModelConfig,
    );

    expect(generateRecorderYamlTest).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          platformId: 'web',
          deviceId: 'https://example.com',
          label: 'https://example.com',
          values: {
            url: 'https://example.com',
            viewportWidth: 1280,
            viewportHeight: 720,
          },
        },
      }),
      mockedModelConfig,
    );
  });

  it('passes streaming options through to core YAML generation', async () => {
    const onChunk = vi.fn();
    await generateYamlTestStream(
      [
        {
          type: 'click',
          elementDescription: 'Login button',
          pageInfo: { width: 1280, height: 720 },
          timestamp: 2,
          hashId: 'click-1',
        },
      ],
      { stream: true, onChunk },
      mockedModelConfig,
    );

    expect(generateRecorderYamlTestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ platformId: 'web' }),
      }),
      expect.objectContaining({ stream: true, onChunk }),
      mockedModelConfig,
    );
  });
});
