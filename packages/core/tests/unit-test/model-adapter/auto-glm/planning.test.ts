import { resolveCustomPlanningDefinition } from '@/ai-model/adapter-resolver/custom-planning';
import { ConversationHistory } from '@/ai-model/conversation-history';
import { autoGlmAdapters } from '@/ai-model/models/auto-glm/adapter';
import { createAutoGlmPlanner } from '@/ai-model/models/auto-glm/planning';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import { runCustomPlanning } from '@/ai-model/workflows/planning/custom-planning';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { UIContext } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockActionSpace } from '../../../common';

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
    actionSpace: mockActionSpace,
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

function runAutoGlmPlanning(
  userInstruction: string,
  options: PlanOptions,
  isMultilingual = false,
) {
  return runCustomPlanning(
    userInstruction,
    options,
    resolveCustomPlanningDefinition(createAutoGlmPlanner(isMultilingual)),
  );
}

describe('createAutoGlmPlanner', () => {
  beforeEach(() => {
    vi.mocked(callAIWithStringResponse).mockReset();
  });

  it('runs Auto-GLM custom planning and transforms tap coordinates', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content:
        '<think>Need to click submit</think><answer>do(action="Tap", element=[500,500])</answer>',
      usage: { total_tokens: 12 } as any,
    });

    const result = await runAutoGlmPlanning(
      'click submit',
      createPlanOptions(),
    );

    expect(callAIWithStringResponse).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
      ]),
      expect.objectContaining({
        config: expect.objectContaining({ modelFamily: 'auto-glm' }),
      }),
      expect.any(Object),
    );
    expect(result.actions).toMatchObject([
      {
        type: 'Tap',
        param: {
          locate: {
            locatedPixelBbox: [490, 392, 509, 407],
          },
        },
      },
    ]);
    expect(result.shouldContinuePlanning).toBe(true);
    expect(result.usage).toEqual({ total_tokens: 12 });
  });

  it('uses actionSpace names for Auto-GLM Back and Home planning actions', async () => {
    vi.mocked(callAIWithStringResponse)
      .mockResolvedValueOnce({
        content: 'Need to go back. do(action="Back")',
      })
      .mockResolvedValueOnce({
        content: 'Return home. do(action="Home")',
      });

    const actionSpace = [
      { name: 'HarmonyBackButton' },
      { name: 'HarmonyHomeButton' },
    ] as any;

    const backResult = await runAutoGlmPlanning(
      'go back',
      createPlanOptions({ actionSpace }),
    );
    const homeResult = await runAutoGlmPlanning(
      'go home',
      createPlanOptions({ actionSpace }),
    );

    expect(backResult.actions).toMatchObject([
      {
        type: 'HarmonyBackButton',
        param: {},
        thought: 'Need to go back.',
      },
    ]);
    expect(homeResult.actions).toMatchObject([
      {
        type: 'HarmonyHomeButton',
        param: {},
        thought: 'Return home.',
      },
    ]);
  });

  it('stops Auto-GLM custom planning on finish action', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'Task is done. finish(message="done")',
    });

    const result = await runAutoGlmPlanning(
      'finish the task',
      createPlanOptions(),
    );

    expect(result.actions).toMatchObject([
      {
        type: 'Finished',
        param: {},
        thought: 'done',
      },
    ]);
    expect(result.shouldContinuePlanning).toBe(false);
  });

  it('wraps Auto-GLM planning parse failures with raw response and usage', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'do(action="UnknownAction")',
      usage: { total_tokens: 3 } as any,
    });

    await expect(
      runAutoGlmPlanning('click submit', createPlanOptions()),
    ).rejects.toMatchObject({
      name: 'AIResponseParseError',
      rawResponse: '"do(action=\\"UnknownAction\\")"',
      usage: { total_tokens: 3 },
    });
  });
});
