import { ConversationHistory } from '@/ai-model/conversation-history';
import { autoGlmAdapters } from '@/ai-model/models/auto-glm/adapter';
import { createAutoGlmPlanner } from '@/ai-model/models/auto-glm/planning';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import { resolveCustomPlanning } from '@/ai-model/workflows/planning/custom-planning';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { UIContext } from '@/types';
import type { ChatCompletionUserMessageParam } from 'openai/resources/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceCallerMock = vi.hoisted(() => {
  class AIResponseParseError extends Error {
    rawResponse?: string;
    usage?: unknown;
    rawChoiceMessage?: unknown;

    constructor(
      message: string,
      rawResponse?: string,
      usage?: unknown,
      rawChoiceMessage?: unknown,
    ) {
      super(message);
      this.name = 'AIResponseParseError';
      this.rawResponse = rawResponse;
      this.usage = usage;
      this.rawChoiceMessage = rawChoiceMessage;
    }
  }

  return {
    AIResponseParseError,
    callAIWithStringResponse: vi.fn(),
  };
});

vi.mock('@/ai-model/service-caller/index', () => {
  return serviceCallerMock;
});

vi.mock('../../../../src/ai-model/service-caller/index', () => {
  return serviceCallerMock;
});

const autoGlmAdapter = new ResolvedModelAdapter(
  autoGlmAdapters['auto-glm'],
  'auto-glm',
);

const context: UIContext = {
  screenshot: {
    base64: 'data:image/png;base64,AA==',
  } as any,
  shotSize: {
    width: 1000,
    height: 800,
  },
  shrunkShotToLogicalRatio: 1,
};

function createPlanOptions(overrides: Partial<PlanOptions> = {}): PlanOptions {
  return {
    context,
    actionSpace: [],
    modelRuntime: {
      config: {
        modelName: 'auto-glm-test-model',
        modelFamily: 'auto-glm',
        modelDescription: 'auto-glm-test-model',
        intent: 'planning',
        slot: 'planning',
      },
      adapter: autoGlmAdapter,
    } as any,
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: true,
    ...overrides,
  };
}

function runAutoGlmPlanning(userInstruction: string, options: PlanOptions) {
  return resolveCustomPlanning(createAutoGlmPlanner(false)).plan(
    userInstruction,
    options,
  );
}

describe('createAutoGlmPlanner messages', () => {
  beforeEach(() => {
    vi.mocked(callAIWithStringResponse).mockReset();
  });

  it('passes Auto-GLM action context, reference images, and abort signal to the model call', async () => {
    const abortController = new AbortController();
    const referenceImageMessages: ChatCompletionUserMessageParam[] = [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,REF==' },
          },
        ],
      },
    ];
    const conversationHistory = new ConversationHistory();
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content:
        '<think>Need to click submit</think><answer>do(action="Tap", element=[500,500])</answer>',
      usage: { total_tokens: 12 } as any,
      rawChoiceMessage: { role: 'assistant', content: 'raw choice' } as any,
    });

    const result = await runAutoGlmPlanning(
      'click submit',
      createPlanOptions({
        actionContext: 'prefer the primary submit button',
        referenceImageMessages,
        conversationHistory,
        abortSignal: abortController.signal,
      }),
    );

    const [messages, runtime, callOptions] = vi.mocked(callAIWithStringResponse)
      .mock.calls[0];
    expect(runtime).toMatchObject({
      config: expect.objectContaining({ modelFamily: 'auto-glm' }),
    });
    expect(callOptions).toEqual({ abortSignal: abortController.signal });
    expect(messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining(
        '<high_priority_knowledge>prefer the primary submit button</high_priority_knowledge>\n',
      ),
    });
    expect(messages[1]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'click submit' }],
    });
    expect(messages).toContain(referenceImageMessages[0]);
    expect(result.rawChoiceMessage).toEqual({
      role: 'assistant',
      content: 'raw choice',
    });
    expect(conversationHistory.snapshot()).toHaveLength(2);
    expect(conversationHistory.snapshot()[1]).toMatchObject({
      role: 'assistant',
      content: expect.stringContaining('do(action="Tap", element=[500,500])'),
    });
  });
});
