import { getModelRuntime } from '@/ai-model/models';
import { callAI, callAIWithObjectResponse } from '@/ai-model/service-caller';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDebugLog, mockWarnLog } = vi.hoisted(() => ({
  mockDebugLog: vi.fn(),
  mockWarnLog: vi.fn(),
}));
const mockCreate = vi.fn();

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn((_topic, options) =>
    options?.console ? mockWarnLog : mockDebugLog,
  ),
}));

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
  slot: 'planning',
};

describe('service-caller reasoning fallback', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockDebugLog.mockClear();
    mockWarnLog.mockClear();
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
      getModelRuntime(baseModelConfig),
    );

    expect(response.content).toContain('<action-type>Tap</action-type>');
    expect(response.reasoning_content).toContain('POI RichInfo tab');
  });

  it('records the raw response model name in usage metadata', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'ok',
          },
        },
      ],
      model: 'doubao-seed-2-0-lite-260215',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });

    const response = await callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime({
        ...baseModelConfig,
        modelName: 'ep-20260402170055-hm5ng',
      }),
    );

    expect(response.usage).toMatchObject({
      model_name: 'ep-20260402170055-hm5ng',
      response_model_name: 'doubao-seed-2-0-lite-260215',
    });
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

  it('uses modelConfig reasoningEnabled by default in callAI', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'ok',
          },
        },
      ],
    });

    await callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime({
        ...baseModelConfig,
        modelFamily: 'doubao-seed',
        reasoningEnabled: true,
      }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        thinking: {
          type: 'enabled',
        },
      }),
      expect.any(Object),
    );
  });

  it('disables reasoning by default for supported model families', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'ok',
          },
        },
      ],
    });

    await callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime({
        ...baseModelConfig,
        modelFamily: 'doubao-seed',
      }),
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        thinking: {
          type: 'disabled',
        },
      }),
      expect.any(Object),
    );
  });

  it('prints adapter chat completion params for debugging', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'ok',
          },
        },
      ],
    });

    await callAI(
      [{ role: 'user', content: 'hello' }],
      getModelRuntime({
        ...baseModelConfig,
        modelFamily: 'glm-v',
        reasoningEnabled: true,
      }),
    );

    expect(mockDebugLog).toHaveBeenCalledWith(
      expect.stringContaining('adapter chat completion params:'),
    );
    expect(mockDebugLog).toHaveBeenCalledWith(
      expect.stringContaining('"thinking":{"type":"enabled"}'),
    );
  });
});
