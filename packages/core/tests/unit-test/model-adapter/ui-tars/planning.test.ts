import { resolveCustomPlanningDefinition } from '@/ai-model/model-adapter/planning';
import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelRuntime } from '@/ai-model/models';
import { uiTarsAdapters } from '@/ai-model/models/ui-tars/adapter';
import { createUiTarsPlanner } from '@/ai-model/models/ui-tars/planning';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import { prepareUserPrompt } from '@/ai-model/shared/multimodal-prompt';
import { ConversationHistory } from '@/ai-model/workflows/planning/conversation-history';
import { runCustomPlanning } from '@/ai-model/workflows/planning/custom-planning';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { TUserPrompt } from '@/common';
import type { UIContext } from '@/types';
import { UITarsModelVersion } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { mockActionSpace } from '../../../common';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  callAIWithStringResponse: rs.fn(),
}));

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

const modelRuntime = getModelRuntime({
  modelName: 'ui-tars-test-model',
  modelFamily: 'vlm-ui-tars',
  modelDescription: 'ui-tars-test-model',
  intent: 'planning',
  slot: 'planning',
});

const uiTarsAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars'],
  'vlm-ui-tars',
);

function createPlanOptions(overrides: Partial<PlanOptions> = {}): PlanOptions {
  return {
    context,
    actionSpace: mockActionSpace,
    modelRuntime,
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: true,
    ...overrides,
    effort: overrides.effort ?? 'balance',
  };
}

async function runUiTarsPlanning(
  userInstruction: TUserPrompt,
  options: PlanOptions,
  uiTarsModelVersion: UITarsModelVersion,
) {
  return runCustomPlanning(
    await prepareUserPrompt(userInstruction),
    options,
    resolveCustomPlanningDefinition(createUiTarsPlanner(uiTarsModelVersion)),
  );
}

describe('createUiTarsPlanner', () => {
  beforeEach(() => {
    rs.mocked(callAIWithStringResponse).mockReset();
  });

  it('runs UI-TARS planning through the resolved adapter planner', async () => {
    expect(uiTarsAdapter.planning.kind).toBe('custom');
    if (uiTarsAdapter.planning.kind !== 'custom') {
      throw new Error('UI-TARS should use custom planning adapter');
    }
    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Click submit
Action: click(start_box='(500,500)')`,
    });

    const result = await uiTarsAdapter.planning.planFn(
      { text: 'click submit', referenceImages: [] },
      createPlanOptions({
        modelRuntime: {
          ...modelRuntime,
          adapter: uiTarsAdapter,
        },
      }),
    );

    expect(result.actions).toMatchObject([
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'Click submit',
            locatedPixelBbox: [490, 392, 509, 407],
          },
        },
      },
    ]);
    expect(result.shouldContinuePlanning).toBe(true);
  });

  it('stops planning when UI-TARS returns a finished action', async () => {
    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: "finished(content='已经将计数器加到3，任务完成。')",
    });

    const result = await runUiTarsPlanning(
      'increase counter to 3',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );

    expect(result.shouldContinuePlanning).toBe(false);
    expect(result.actions).toMatchObject([
      {
        type: 'Finished',
        param: {},
        thought: '已经将计数器加到3，任务完成。',
      },
    ]);
  });

  it('passes action context, reference images, and abort signal to the model call', async () => {
    const abortController = new AbortController();
    const conversationHistory = new ConversationHistory();

    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Click submit
Action: click(start_box='(500,500)')`,
      usage: { total_tokens: 33 } as any,
      rawChoiceMessage: { role: 'assistant', content: 'raw choice' } as any,
    });

    const result = await runUiTarsPlanning(
      {
        prompt: 'click submit',
        images: [
          {
            name: 'submit reference',
            url: 'data:image/png;base64,REF==',
          },
        ],
      },
      createPlanOptions({
        actionContext:
          '<REQUEST_CONTEXT source="api" api="aiAct">\nprefer the primary submit button\n</REQUEST_CONTEXT>',
        conversationHistory,
        abortSignal: abortController.signal,
      }),
      UITarsModelVersion.V1_0,
    );

    const [messages, runtime, callOptions] = rs.mocked(callAIWithStringResponse)
      .mock.calls[0];
    expect(runtime).toBe(modelRuntime);
    expect(callOptions).toEqual({
      abortSignal: abortController.signal,
      requiresOriginalImageDetail: true,
    });
    expect(messages[0]).toMatchObject({
      role: 'user',
      content: expect.stringContaining(
        '<REQUEST_CONTEXT source="api" api="aiAct">\nprefer the primary submit button\n</REQUEST_CONTEXT>\n',
      ),
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({ type: 'image_url' }),
          ]),
        }),
      ]),
    );
    expect(conversationHistory.snapshot()).toHaveLength(2);
    expect(conversationHistory.snapshot()[1]).toMatchObject({
      role: 'assistant',
      content: expect.stringContaining('Click submit'),
    });
    expect(result.usage).toEqual({ total_tokens: 33 });
    expect(result.rawChoiceMessage).toEqual({
      role: 'assistant',
      content: 'raw choice',
    });
  });

  it('wraps malformed UI-TARS planning responses with raw response and usage', async () => {
    rs.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'Thought: I know what to do, but no action line.',
      usage: { total_tokens: 5 } as any,
      rawChoiceMessage: { role: 'assistant', content: 'bad response' } as any,
    });

    await expect(
      runUiTarsPlanning(
        'click submit',
        createPlanOptions(),
        UITarsModelVersion.V1_0,
      ),
    ).rejects.toMatchObject({
      name: 'AIResponseParseError',
      rawResponse: '"Thought: I know what to do, but no action line."',
      rawChoiceMessage: { role: 'assistant', content: 'bad response' },
      usage: { total_tokens: 5 },
    });
  });
});
