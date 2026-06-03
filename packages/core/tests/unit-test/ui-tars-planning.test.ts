import { ConversationHistory } from '@/ai-model/conversation-history';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import { uiTarsPlanning } from '@/ai-model/ui-tars-planning';
import type { UIContext } from '@/types';
import { type IModelConfig, UITarsModelVersion } from '@midscene/shared/env';
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

const modelConfig: IModelConfig = {
  modelName: 'ui-tars-test-model',
  modelFamily: 'vlm-ui-tars',
  modelDescription: 'ui-tars-test-model',
  intent: 'planning',
  slot: 'planning',
  uiTarsModelVersion: UITarsModelVersion.V1_0,
};

function createPlanOptions() {
  return {
    context,
    modelConfig,
    conversationHistory: new ConversationHistory(),
  };
}

function firstAction(result: Awaited<ReturnType<typeof uiTarsPlanning>>) {
  expect(result.actions).toHaveLength(1);
  const action = result.actions?.[0];
  if (!action) {
    throw new Error('expected ui-tars planning to return an action');
  }
  return action;
}

describe('uiTarsPlanning', () => {
  beforeEach(() => {
    vi.mocked(callAIWithStringResponse).mockReset();
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
