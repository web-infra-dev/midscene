import { ConversationHistory } from '@/ai-model/conversation-history';
import { getModelRuntime } from '@/ai-model/models';
import { uiTarsPlanning } from '@/ai-model/models/ui-tars/planning';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { PlanningAction, UIContext } from '@/types';
import { UITarsModelVersion } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller/index', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/service-caller/index')>();
  return {
    ...actual,
    callAIWithStringResponse: vi.fn(),
  };
});

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

function createPlanOptions(): PlanOptions {
  return {
    context,
    actionSpace: [],
    modelRuntime,
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: true,
  };
}

type UiTarsActionParam = {
  locate?: Record<string, unknown>;
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
};

function firstAction(result: Awaited<ReturnType<typeof uiTarsPlanning>>) {
  expect(result.actions).toHaveLength(1);
  const action = result.actions?.[0];
  if (!action) {
    throw new Error('expected ui-tars planning to return an action');
  }
  return action as PlanningAction<UiTarsActionParam>;
}

describe('uiTarsPlanning', () => {
  beforeEach(() => {
    vi.mocked(callAIWithStringResponse).mockReset();
  });

  it('transforms click coordinates into locatedPixelBbox', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Click submit
Action: click(start_box='(500,500)')`,
    });

    const result = await uiTarsPlanning(
      'click submit',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const action = firstAction(result);

    expect(action).toMatchObject({
      type: 'Tap',
      param: {
        locate: {
          prompt: 'Click submit',
          locatedPixelBbox: [490, 392, 509, 407],
        },
      },
    });
    expect(action.param.locate).not.toHaveProperty('bbox');
  });

  it('transforms drag coordinates into locatedPixelBbox', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Drag item
Action: drag(start_box='(100,200)', end_box='(300,400)')`,
    });

    const result = await uiTarsPlanning(
      'drag item',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const action = firstAction(result);

    expect(action).toMatchObject({
      type: 'DragAndDrop',
      param: {
        from: {
          prompt: 'Drag item',
          locatedPixelBbox: [90, 152, 110, 168],
        },
        to: {
          prompt: 'Drag item',
          locatedPixelBbox: [290, 312, 310, 328],
        },
      },
    });
    expect(action.param.from).not.toHaveProperty('bbox');
    expect(action.param.to).not.toHaveProperty('bbox');
  });

  it('keeps click locatedPixelBbox inside inclusive image bounds', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Click lower right
Action: click(start_box='(1000,1000)')`,
    });

    const result = await uiTarsPlanning(
      'click lower right',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const action = firstAction(result);

    expect(action).toMatchObject({
      type: 'Tap',
      param: {
        locate: {
          prompt: 'Click lower right',
          locatedPixelBbox: [989, 791, 999, 799],
        },
      },
    });
  });

  it('transforms fenced finished content into a Finished action thought', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `\`\`\`
finished(content='已经将计数器加到3，任务完成。')
\`\`\``,
    });

    const result = await uiTarsPlanning(
      'increase counter to 3',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const action = firstAction(result);

    expect(result.shouldContinuePlanning).toBe(false);
    expect(action).toMatchObject({
      type: 'Finished',
      param: {},
      thought: '已经将计数器加到3，任务完成。',
    });
  });
});
