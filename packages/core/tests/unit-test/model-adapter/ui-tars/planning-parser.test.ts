import { ConversationHistory } from '@/ai-model/conversation-history';
import { getModelRuntime } from '@/ai-model/models';
import { uiTarsPlanning } from '@/ai-model/models/ui-tars/planning';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { UIContext } from '@/types';
import { UITarsModelVersion } from '@midscene/shared/env';
import { actionParser } from '@ui-tars/action-parser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui-tars/action-parser', () => ({
  actionParser: vi.fn(),
}));

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

describe('uiTarsPlanning parser failures', () => {
  beforeEach(() => {
    vi.mocked(callAIWithStringResponse).mockReset();
    vi.mocked(actionParser).mockReset();
  });

  it('wraps action parser exceptions as AI response parse errors', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'Thought: Click submit\nAction: click(start_box="bad")',
      usage: { total_tokens: 11 } as any,
      rawChoiceMessage: { role: 'assistant', content: 'bad parse' } as any,
    });
    vi.mocked(actionParser).mockImplementationOnce(() => {
      throw new Error('parser exploded');
    });

    await expect(
      uiTarsPlanning(
        'click submit',
        createPlanOptions(),
        UITarsModelVersion.V1_0,
      ),
    ).rejects.toMatchObject({
      name: 'AIResponseParseError',
      message: 'Parse error: parser exploded',
      rawResponse:
        '"Thought: Click submit\\nAction: click(start_box=\\"bad\\")"',
      rawChoiceMessage: { role: 'assistant', content: 'bad parse' },
      usage: { total_tokens: 11 },
    });
  });

  it('reports missing Action lines when the parser returns no actions', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'Thought: I know the next step.',
    });
    vi.mocked(actionParser).mockReturnValueOnce({ parsed: [] });

    await expect(
      uiTarsPlanning(
        'click submit',
        createPlanOptions(),
        UITarsModelVersion.V1_0,
      ),
    ).rejects.toThrow(
      /Action parser returned no actions\nResponse contains "Thought:" but missing "Action:" line/,
    );
  });

  it('reports malformed responses when the parser returns no actions', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'plain malformed response',
    });
    vi.mocked(actionParser).mockReturnValueOnce({ parsed: [] });

    await expect(
      uiTarsPlanning(
        'click submit',
        createPlanOptions(),
        UITarsModelVersion.V1_0,
      ),
    ).rejects.toThrow(
      /Action parser returned no actions\nResponse may be malformed or empty/,
    );
  });
});
