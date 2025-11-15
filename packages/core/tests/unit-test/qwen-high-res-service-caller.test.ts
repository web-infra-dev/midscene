import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock photon packages to prevent resolution issues
vi.mock('@silvia-odwyer/photon', () => ({}));
vi.mock('@silvia-odwyer/photon-node', () => ({}));
vi.mock('@midscene/shared/img', () => ({}));
vi.mock('@midscene/shared/src/img/get-photon', () => ({}));

vi.mock('openai', () => ({
  default: vi.fn()
}));
vi.mock('@midscene/shared/env', () => ({
  globalConfigManager: {
    getEnvConfigValue: vi.fn(),
    getEnvConfigInBoolean: vi.fn(),
  },
  globalModelConfigManager: {
    getModelConfig: vi.fn(),
  },
  OPENAI_MAX_TOKENS: 'OPENAI_MAX_TOKENS',
  MIDSCENE_LANGSMITH_DEBUG: 'MIDSCENE_LANGSMITH_DEBUG',
  MIDSCENE_API_TYPE: 'MIDSCENE_API_TYPE',
}));

import { callAI } from '../../src/ai-model/service-caller/index';
import { AIActionType } from '../../src/ai-model/common';
import type { IModelConfig } from '@midscene/shared/env';
import { globalConfigManager, globalModelConfigManager } from '@midscene/shared/env';

describe('QWEN High Resolution Service Caller Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globalConfigManager.getEnvConfigValue).mockReturnValue(undefined);
    vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(false);
  });

  it('should include vl_high_resolution_images when QWEN model and flag enabled', async () => {
    const mockConfig: IModelConfig = {
      modelName: 'qwen-vl-max',
      vlMode: 'qwen-vl',
      qwenHighResolution: true,
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://api.openai.com/v1',
      modelDescription: 'test model',
      from: 'env',
      intent: 'default',
    };

    const mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }],
            usage: { total_tokens: 100 },
          }),
        },
      },
    };

    const { default: OpenAI } = await import('openai');
    vi.mocked(OpenAI).mockReturnValue(mockOpenAI as any);

    await callAI(
      [{ role: 'user', content: 'test message' }],
      AIActionType.INSPECT_ELEMENT,
      mockConfig
    );

    const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(createCall).toHaveProperty('vl_high_resolution_images', true);
  });

  it('should include vl_high_resolution_images when QWEN3 model and flag enabled', async () => {
    const mockConfig: IModelConfig = {
      modelName: 'qwen3-vl-max',
      vlMode: 'qwen3-vl',
      qwenHighResolution: true,
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://api.openai.com/v1',
      modelDescription: 'test model',
      from: 'env',
      intent: 'default',
    };

    const mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }],
            usage: { total_tokens: 100 },
          }),
        },
      },
    };

    const { default: OpenAI } = await import('openai');
    vi.mocked(OpenAI).mockReturnValue(mockOpenAI as any);

    await callAI(
      [{ role: 'user', content: 'test message' }],
      AIActionType.INSPECT_ELEMENT,
      mockConfig
    );

    const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(createCall).toHaveProperty('vl_high_resolution_images', true);
  });

  it('should not include vl_high_resolution_images when QWEN model and flag disabled', async () => {
    const mockConfig: IModelConfig = {
      modelName: 'qwen-vl-max',
      vlMode: 'qwen-vl',
      qwenHighResolution: false,
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://api.openai.com/v1',
      modelDescription: 'test model',
      from: 'env',
      intent: 'default',
    };

    const mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }],
            usage: { total_tokens: 100 },
          }),
        },
      },
    };

    const { default: OpenAI } = await import('openai');
    vi.mocked(OpenAI).mockReturnValue(mockOpenAI as any);

    await callAI(
      [{ role: 'user', content: 'test message' }],
      AIActionType.INSPECT_ELEMENT,
      mockConfig
    );

    const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(createCall).not.toHaveProperty('vl_high_resolution_images');
  });

  it('should default to enabled when QWEN model and flag unspecified', async () => {
    const mockConfig: IModelConfig = {
      modelName: 'qwen-vl-max',
      vlMode: 'qwen-vl',
      qwenHighResolution: undefined,
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://api.openai.com/v1',
      modelDescription: 'test model',
      from: 'env',
      intent: 'default',
    };

    const mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }],
            usage: { total_tokens: 100 },
          }),
        },
      },
    };

    const { default: OpenAI } = await import('openai');
    vi.mocked(OpenAI).mockReturnValue(mockOpenAI as any);

    await callAI(
      [{ role: 'user', content: 'test message' }],
      AIActionType.INSPECT_ELEMENT,
      mockConfig
    );

    const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(createCall).toHaveProperty('vl_high_resolution_images', true);
  });

  it('should ignore flag for non-QWEN models even when enabled', async () => {
    const mockConfig: IModelConfig = {
      modelName: 'gpt-4o',
      vlMode: 'gemini',
      qwenHighResolution: true,
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://api.openai.com/v1',
      modelDescription: 'test model',
      from: 'env',
      intent: 'default',
    };

    const mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }],
            usage: { total_tokens: 100 },
          }),
        },
      },
    };

    const { default: OpenAI } = await import('openai');
    vi.mocked(OpenAI).mockReturnValue(mockOpenAI as any);

    await callAI(
      [{ role: 'user', content: 'test message' }],
      AIActionType.INSPECT_ELEMENT,
      mockConfig
    );

    const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(createCall).not.toHaveProperty('vl_high_resolution_images');
  });

  it('should not include vl_high_resolution_images when QWEN3 model and flag disabled', async () => {
    const mockConfig: IModelConfig = {
      modelName: 'qwen3-vl-max',
      vlMode: 'qwen3-vl',
      qwenHighResolution: false,
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://api.openai.com/v1',
      modelDescription: 'test model',
      from: 'env',
      intent: 'default',
    };

    const mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }],
            usage: { total_tokens: 100 },
          }),
        },
      },
    };

    const { default: OpenAI } = await import('openai');
    vi.mocked(OpenAI).mockReturnValue(mockOpenAI as any);

    await callAI(
      [{ role: 'user', content: 'test message' }],
      AIActionType.INSPECT_ELEMENT,
      mockConfig
    );

    const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(createCall).not.toHaveProperty('vl_high_resolution_images');
  });

  it('should default to enabled when QWEN3 model and flag unspecified', async () => {
    const mockConfig: IModelConfig = {
      modelName: 'qwen3-vl-max',
      vlMode: 'qwen3-vl',
      qwenHighResolution: undefined,
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://api.openai.com/v1',
      modelDescription: 'test model',
      from: 'env',
      intent: 'default',
    };

    const mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'test response' } }],
            usage: { total_tokens: 100 },
          }),
        },
      },
    };

    const { default: OpenAI } = await import('openai');
    vi.mocked(OpenAI).mockReturnValue(mockOpenAI as any);

    await callAI(
      [{ role: 'user', content: 'test message' }],
      AIActionType.INSPECT_ELEMENT,
      mockConfig
    );

    const createCall = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(createCall).toHaveProperty('vl_high_resolution_images', true);
  });
});
