import type { IModelConfig } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

const mockResponsesCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      responses: {
        create: mockResponsesCreate,
      },
    })),
  };
});

describe('AiLocateElement with gpt-5 computer tool', () => {
  it('parses computer_call point action and returns a located element', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      id: 'resp_test_1',
      output: [
        {
          type: 'computer_call',
          actions: [{ type: 'click', x: 310, y: 420 }],
        },
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_tokens_details: {
          cached_tokens: 10,
        },
      },
    });

    const { AiLocateElement } = await import('@/ai-model/inspect');

    const context = {
      screenshot: {
        base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
      },
      shotSize: {
        width: 1080,
        height: 1920,
      },
    } as any;

    const modelConfig: IModelConfig = {
      modelName: 'gpt-5.4',
      modelFamily: 'gpt-5',
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://example.invalid/v1',
      modelDescription: 'test model',
      intent: 'default',
      from: 'env',
    };

    const result = await AiLocateElement({
      context,
      targetElementDescription: 'the submit button',
      modelConfig,
    });

    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
    expect(result.parseResult.errors).toEqual([]);
    expect(result.parseResult.elements).toHaveLength(1);
    expect(result.parseResult.elements[0]?.center).toEqual([310, 420]);
    expect(result.rect).toBeDefined();
    expect(result.usage).toMatchObject({
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      cached_input: 10,
      request_id: 'resp_test_1',
    });
  });
});
