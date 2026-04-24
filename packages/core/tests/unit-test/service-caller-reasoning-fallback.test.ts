import { callAI, callAIWithObjectResponse } from '@/ai-model/service-caller';
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
  modelName: 'doubao-seed-2-0-lite-260215',
  modelDescription: 'test',
  openaiApiKey: 'test-key',
  openaiBaseURL: 'https://example.com/v1',
  intent: 'planning',
};

describe('service-caller reasoning fallback', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('uses reasoning_content when content is empty and modelFamily is unset', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '',
            reasoning_content:
              '<action-type>Tap</action-type><action-param-json>{"locate":{"prompt":"POI RichInfo tab"}}</action-param-json>',
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });

    const response = await callAI(
      [{ role: 'user', content: 'next action' }],
      baseModelConfig,
    );

    expect(response.content).toContain('<action-type>Tap</action-type>');
    expect(response.reasoning_content).toContain('POI RichInfo tab');
  });

  it('parses object responses from reasoning_content when content is blank', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: '   ',
            reasoning_content:
              '{"type":"Tap","param":{"locate":{"prompt":"POI RichInfo tab"}}}',
          },
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });

    const response = await callAIWithObjectResponse<{
      type: string;
      param: { locate: { prompt: string } };
    }>([{ role: 'user', content: 'next action' }], baseModelConfig);

    expect(response.content).toEqual({
      type: 'Tap',
      param: {
        locate: {
          prompt: 'POI RichInfo tab',
        },
      },
    });
    expect(response.contentString).toBe(
      '{"type":"Tap","param":{"locate":{"prompt":"POI RichInfo tab"}}}',
    );
  });
});
