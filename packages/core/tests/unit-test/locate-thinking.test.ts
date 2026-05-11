import { AiLocateElement, AiLocateSection } from '@/ai-model/inspect';
import { callAIWithObjectResponse } from '@/ai-model/service-caller/index';
import type { IModelConfig } from '@midscene/shared/env';
import { createFakeContext } from 'tests/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller/index', () => ({
  AIResponseParseError: class AIResponseParseError extends Error {
    rawResponse: string;
    usage: unknown;

    constructor(message: string, rawResponse: string, usage?: unknown) {
      super(message);
      this.rawResponse = rawResponse;
      this.usage = usage;
    }
  },
  callAI: vi.fn(),
  callAIWithObjectResponse: vi.fn(),
  callAIWithStringResponse: vi.fn(),
}));

describe('locate model calls thinking defaults', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'qwen3-vl',
    modelName: 'test-model',
    modelDescription: 'test model',
    intent: 'default',
    reasoningEnabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forces deepThink=false for element locate calls', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: { bbox: [100, 100, 200, 200] },
      contentString: '{"bbox":[100,100,200,200]}',
      usage: undefined,
      reasoning_content: undefined,
    });

    await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: 'submit button',
      modelConfig,
    });

    expect(callAIWithObjectResponse).toHaveBeenCalledWith(
      expect.any(Array),
      modelConfig,
      { abortSignal: undefined, deepThink: false },
    );
  });

  it('forces deepThink=false for deepLocate section calls', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: { error: 'not found' },
      contentString: '{"error":"not found"}',
      usage: undefined,
      reasoning_content: undefined,
    });

    await AiLocateSection({
      context: createFakeContext(),
      sectionDescription: 'toolbar area',
      modelConfig,
    });

    expect(callAIWithObjectResponse).toHaveBeenCalledWith(
      expect.any(Array),
      modelConfig,
      { abortSignal: undefined, deepThink: false },
    );
  });
});
