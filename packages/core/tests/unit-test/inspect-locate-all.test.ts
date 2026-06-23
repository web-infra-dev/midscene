import { getModelRuntime } from '@/ai-model/models';
import { callAIWithObjectResponse } from '@/ai-model/service-caller/index';
import { AiLocateAllElements } from '@/ai-model/workflows/inspect';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeContext } from '../utils';

vi.mock('@/ai-model/service-caller/index', async () => {
  const actual = await vi.importActual<
    typeof import('@/ai-model/service-caller/index')
  >('@/ai-model/service-caller/index');
  return {
    ...actual,
    callAIWithObjectResponse: vi.fn(),
  };
});

describe('AiLocateAllElements', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen2.5-vl',
    modelName: 'test-model',
    modelDescription: 'test-model-desc',
    intent: 'default',
    slot: 'default',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses, sorts, and deduplicates multiple locate results in one model call', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {
        elements: [
          { bbox: [300, 100, 350, 130] },
          { bbox: [100, 100, 120, 130] },
          { bbox: [101, 101, 120, 130] },
          { bbox: [10, 20, Number.NaN, 40] },
        ],
        errors: ['model warning'],
      },
      rawChoiceMessage: { role: 'assistant' },
      usage: { total_tokens: 10 } as any,
      reasoning_content: 'all locate reasoning',
      contentString: '{}',
    });

    const result = await AiLocateAllElements({
      context: createFakeContext(),
      targetElementDescription: 'submit buttons',
      modelRuntime: getModelRuntime(modelConfig),
    });

    expect(callAIWithObjectResponse).toHaveBeenCalledTimes(1);
    expect(result.parseResult.elements.map((element) => element.rect)).toEqual([
      { left: 100, top: 100, width: 21, height: 31 },
      { left: 300, top: 100, width: 51, height: 31 },
    ]);
    expect(result.parseResult.errors).toEqual([
      'model warning',
      expect.stringMatching(/Failed to parse locate result #4/),
    ]);
    expect(result.rawChoiceMessage).toEqual({ role: 'assistant' });
    expect(result.usage).toEqual({ total_tokens: 10 });
    expect(result.reasoning_content).toBe('all locate reasoning');
  });
});
