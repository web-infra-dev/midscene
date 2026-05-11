import { Agent } from '@/agent';
import { AiLocateElement, AiLocateSection } from '@/ai-model/inspect';
import { callAIWithObjectResponse } from '@/ai-model/service-caller/index';
import type { AbstractInterface } from '@/device';
import type { UIContext } from '@/types';
import {
  type IModelConfig,
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_REASONING_ENABLED,
} from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller/index', () => ({
  callAIWithObjectResponse: vi.fn(),
  callAIWithStringResponse: vi.fn(),
  callAI: vi.fn(),
  resolveReasoningEnabled: vi.fn(
    ({ deepThink, modelConfig }) =>
      (deepThink === 'unset' ? undefined : deepThink) ??
      modelConfig.reasoningEnabled,
  ),
  AIResponseParseError: class AIResponseParseError extends Error {},
}));

const context: UIContext = {
  screenshot: {
    base64: 'data:image/png;base64,test',
  },
  shotSize: {
    width: 100,
    height: 100,
  },
} as UIContext;

const modelConfig: IModelConfig = {
  modelName: 'test-model',
  reasoningEnabled: true,
};

describe('inspect locate reasoning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables model reasoning for element locate requests', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {
        bbox: [0, 0, 50, 50],
      },
      contentString: '{"bbox":[0,0,50,50]}',
    });

    await AiLocateElement({
      context,
      targetElementDescription: 'submit button',
      modelConfig,
    });

    expect(callAIWithObjectResponse).toHaveBeenCalledWith(
      expect.any(Array),
      modelConfig,
      expect.objectContaining({
        reasoningEnabled: false,
      }),
    );
  });

  it('disables model reasoning for section locate requests', async () => {
    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: {},
      contentString: '{}',
    });

    await AiLocateSection({
      context,
      sectionDescription: 'login form',
      modelConfig,
    });

    expect(callAIWithObjectResponse).toHaveBeenCalledWith(
      expect.any(Array),
      modelConfig,
      expect.objectContaining({
        reasoningEnabled: false,
      }),
    );
  });
});

describe('aiAct planning locate reasoning', () => {
  it('excludes bbox from planning when model reasoning is enabled by config', async () => {
    const mockInterface = {
      interfaceType: 'web',
      actionSpace: vi.fn().mockReturnValue([]),
    } as unknown as AbstractInterface;
    const agent = new Agent(mockInterface, {
      generateReport: false,
      modelConfig: {
        [MIDSCENE_MODEL_NAME]: 'test-model',
        [MIDSCENE_MODEL_API_KEY]: 'test-key',
        [MIDSCENE_MODEL_BASE_URL]: 'https://example.com/v1',
        [MIDSCENE_MODEL_FAMILY]: 'qwen2.5-vl',
        [MIDSCENE_MODEL_REASONING_ENABLED]: 'true',
      },
    });
    const actionSpy = vi
      .spyOn(agent.taskExecutor, 'action')
      .mockResolvedValue({} as any);

    await agent.aiAct('click the submit button');

    expect(actionSpy).toHaveBeenCalledWith(
      'click the submit button',
      expect.any(Object),
      expect.any(Object),
      false,
      undefined,
      undefined,
      expect.any(Number),
      1,
      false,
      true,
      undefined,
      undefined,
      undefined,
    );
  });
});
