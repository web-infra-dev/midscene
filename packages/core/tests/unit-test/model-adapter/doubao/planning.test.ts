import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller/index';
import { prepareUserPrompt } from '@/ai-model/shared/multimodal-prompt';
import { AiLocateElement } from '@/ai-model/workflows/grounding';
import { standardPlan } from '@/ai-model/workflows/planning';
import { ConversationHistory } from '@/ai-model/workflows/planning/conversation-history';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { mockActionSpace } from '../../../common';
import { createFakeContext } from '../../../utils';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  callAI: rs.fn(),
}));

const runDoubaoPlan = async (userInstruction: string, options: PlanOptions) =>
  standardPlan(await prepareUserPrompt(userInstruction), options);

describe('doubao standard planning', () => {
  const modelConfig: IModelConfig = {
    modelFamily: 'doubao-seed',
    modelName: 'doubao-test-model',
    modelDescription: 'doubao-test-model',
    intent: 'planning',
    slot: 'planning',
    retryCount: 0,
    retryInterval: 0,
  };

  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('parses a Seed action locator and normalizes its point to a pixel bbox', async () => {
    rs.mocked(callAI).mockResolvedValueOnce({
      content: `<planning>Tap the Submit button</planning>
<log>Tap the Submit button</log>
<seed:tool_call><function name="Tap"><parameter name="locate" string="true"><prompt>the Submit button</prompt><point>500 600</point></parameter></function></seed:tool_call>`,
      isStreamed: false,
    });

    const result = await runDoubaoPlan('tap the Submit button', {
      context: createFakeContext(),
      actionSpace: mockActionSpace,
      modelRuntime: getModelRuntime(modelConfig),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: true,
      effort: 'balance',
    });

    expect(result.actions).toEqual([
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'the Submit button',
            point: '<point>500 600</point>',
            locatedPixelBbox: [940, 637, 979, 658],
          },
        },
      },
    ]);
  });

  it('uses independent locate after planning returns only a locator prompt', async () => {
    rs.mocked(callAI)
      .mockResolvedValueOnce({
        content: `<planning>Tap the Submit button</planning>
<log>Tap the Submit button</log>
<seed:tool_call><function name="Tap"><parameter name="locate" string="true"><prompt>the Submit button</prompt></parameter></function></seed:tool_call>`,
        isStreamed: false,
      })
      .mockResolvedValueOnce({
        content:
          '<seed:tool_call><function name="click"><parameter name="point" string="true"><point>500 600</point></parameter></function></seed:tool_call>',
        isStreamed: false,
      });

    const planningResult = await runDoubaoPlan('tap the Submit button', {
      context: createFakeContext(),
      actionSpace: mockActionSpace,
      modelRuntime: getModelRuntime(modelConfig),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });
    const plannedAction = planningResult.actions?.[0];
    if (!plannedAction) {
      throw new Error('Expected planning to return a Tap action');
    }

    expect(plannedAction).toEqual({
      type: 'Tap',
      param: {
        locate: {
          prompt: 'the Submit button',
        },
      },
    });

    const locateResult = await AiLocateElement({
      context: createFakeContext(),
      targetElementDescription: plannedAction.param.locate.prompt,
      modelRuntime: getModelRuntime({
        ...modelConfig,
        intent: 'default',
        slot: 'default',
      }),
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(locateResult.rect).toBeDefined();
    expect(locateResult.parseResult.errors).toEqual([]);
  });

  it('stops planning when the response completes without an action', async () => {
    rs.mocked(callAI).mockResolvedValueOnce({
      content: `<planning>The task is complete</planning>
<complete success="true">Done</complete>`,
      isStreamed: false,
    });

    const result = await runDoubaoPlan('finish the task', {
      context: createFakeContext(),
      actionSpace: mockActionSpace,
      modelRuntime: getModelRuntime(modelConfig),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });

    expect(result.actions).toEqual([]);
    expect(result.finalizeSuccess).toBe(true);
    expect(result.finalizeMessage).toBe('Done');
    expect(result.shouldContinuePlanning).toBe(false);
  });

  it('updates sub-goal history in deepThink planning', async () => {
    rs.mocked(callAI).mockResolvedValueOnce({
      content: `<planning>I should tap the Submit button first</planning>
<update-plan-content>
  <sub-goal index="1" status="pending">Tap the Submit button</sub-goal>
  <sub-goal index="2" status="pending">Confirm submission</sub-goal>
</update-plan-content>
<log>Tap the Submit button</log>
<seed:tool_call><function name="Tap"><parameter name="locate" string="true"><prompt>the Submit button</prompt></parameter></function></seed:tool_call>`,
      isStreamed: false,
    });
    const conversationHistory = new ConversationHistory();

    const result = await runDoubaoPlan('submit the form', {
      context: createFakeContext(),
      actionSpace: mockActionSpace,
      modelRuntime: getModelRuntime(modelConfig),
      conversationHistory,
      includeLocateInPlanning: false,
      effort: 'deepThink',
    });

    expect(result.actions).toEqual([
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'the Submit button',
          },
        },
      },
    ]);
    expect(conversationHistory.subGoalsToText()).toContain(
      'Tap the Submit button (running)',
    );
    expect(conversationHistory.subGoalsToText()).toContain(
      'Confirm submission (pending)',
    );
    expect(conversationHistory.subGoalsToText()).toContain(
      '- Tap the Submit button',
    );

    const [messages] = rs.mocked(callAI).mock.calls[0];
    expect(messages[0].content).toContain('<update-plan-content>');
  });
});
