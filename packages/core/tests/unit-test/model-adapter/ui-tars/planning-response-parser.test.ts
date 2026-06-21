import { ConversationHistory } from '@/ai-model/conversation-history';
import { getModelRuntime } from '@/ai-model/models';
import { transformUiTarsActions } from '@/ai-model/models/ui-tars/actions';
import {
  type UiTarsParsedPlanningResponse,
  parseUiTarsPlanningResponse,
} from '@/ai-model/models/ui-tars/parser';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { UIContext } from '@/types';
import { UITarsModelVersion } from '@midscene/shared/env';
import { actionParser } from '@ui-tars/action-parser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui-tars/action-parser', () => ({
  actionParser: vi.fn(),
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

function createPlanOptions(): PlanOptions {
  return {
    context,
    actionSpace: [],
    modelRuntime,
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: true,
  };
}

function parsedResponse(
  actions: UiTarsParsedPlanningResponse['actions'],
  rawResponse: string,
): UiTarsParsedPlanningResponse {
  return {
    rawResponse,
    actions,
  };
}

describe('parseUiTarsPlanningResponse failures', () => {
  beforeEach(() => {
    vi.mocked(actionParser).mockReset();
  });

  it('throws action parser exceptions directly', () => {
    vi.mocked(actionParser).mockImplementationOnce(() => {
      throw new Error('parser exploded');
    });

    expect(() =>
      parseUiTarsPlanningResponse(
        'Thought: Click submit\nAction: click(start_box="bad")',
        createPlanOptions().context.shotSize,
        UITarsModelVersion.V1_0,
      ),
    ).toThrow('parser exploded');
  });

  it('converts bbox tags to center coordinates before parsing', () => {
    vi.mocked(actionParser).mockReturnValueOnce({ parsed: [] });

    parseUiTarsPlanningResponse(
      "Thought: Click converted bbox\nAction: click(start_box='<bbox>400 300 600 700</bbox>')",
      createPlanOptions().context.shotSize,
      UITarsModelVersion.V1_0,
    );

    expect(actionParser).toHaveBeenCalledWith(
      expect.objectContaining({
        prediction: expect.stringContaining('(500,500)'),
      }),
    );
  });

  it('reports missing Action lines when the parser returns no actions', () => {
    expect(() =>
      transformUiTarsActions(
        parsedResponse([], 'Thought: I know the next step.'),
      ),
    ).toThrow(
      /Action parser returned no actions\nResponse contains "Thought:" but missing "Action:" line/,
    );
  });

  it('reports malformed responses when the parser returns no actions', () => {
    expect(() =>
      transformUiTarsActions(parsedResponse([], 'plain malformed response')),
    ).toThrow(
      /Action parser returned no actions\nResponse may be malformed or empty/,
    );
  });
});
