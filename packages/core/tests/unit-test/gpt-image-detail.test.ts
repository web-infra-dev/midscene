import { getModelAdapter } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

const baseModelConfig: IModelConfig = {
  modelName: 'gpt-5.4',
  modelDescription: 'test',
  openaiApiKey: 'test-key',
  openaiBaseURL: 'https://api.openai.com/v1',
  modelFamily: 'gpt-5',
  intent: 'default',
  slot: 'default',
};

const imageMessage = [
  {
    role: 'user' as const,
    content: [
      {
        type: 'image_url' as const,
        image_url: {
          url: 'https://example.com/shot.png',
          detail: 'high' as const,
        },
      },
      {
        type: 'text' as const,
        text: 'Inspect this screenshot.',
      },
    ],
  },
];

describe('GPT image detail handling', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });
  });

  it('forces original detail only for gpt-5 default intent', () => {
    expect(
      getModelAdapter('gpt-5').chatCompletion.resolveImageDetail({
        intent: 'default',
      }),
    ).toBe('original');
    expect(
      getModelAdapter('gpt-5').chatCompletion.resolveImageDetail({
        intent: 'planning',
      }),
    ).toBeUndefined();
    expect(
      getModelAdapter('qwen3-vl').chatCompletion.resolveImageDetail({
        intent: 'default',
      }),
    ).toBeUndefined();
  });

  it('overrides image detail to original for gpt-5 default intent requests', async () => {
    await callAI(imageMessage, baseModelConfig);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'https://example.com/shot.png',
                  detail: 'original',
                },
              },
              {
                type: 'text',
                text: 'Inspect this screenshot.',
              },
            ],
          },
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('keeps the original image detail for non-default intents', async () => {
    await callAI(imageMessage, {
      ...baseModelConfig,
      intent: 'planning',
      slot: 'planning',
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'https://example.com/shot.png',
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: 'Inspect this screenshot.',
              },
            ],
          },
        ],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('does not let extraBody override gpt-5 locked temperature policy', async () => {
    await callAI(imageMessage, {
      ...baseModelConfig,
      extraBody: {
        temperature: 0.7,
      },
    });

    expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('temperature');
  });
});
