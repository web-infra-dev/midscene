import { ConversationHistory } from '@/ai-model/conversation-history';
import { resolveCustomPlanningDefinition } from '@/ai-model/model-adapter/planning';
import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { doubaoXAdapters } from '@/ai-model/models/doubao-x/adapter';
import { createDoubaoXPlanner } from '@/ai-model/models/doubao-x/planning';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import { runCustomPlanning } from '@/ai-model/workflows/planning/custom-planning';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { UIContext } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockActionSpace } from '../../../common';

const serviceCallerMock = vi.hoisted(() => ({
  callAIWithStringResponse: vi.fn(),
}));

vi.mock('@/ai-model/service-caller/index', () => serviceCallerMock);
vi.mock(
  '../../../../src/ai-model/service-caller/index',
  () => serviceCallerMock,
);

const adapter = new ResolvedModelAdapter(
  doubaoXAdapters['doubao-x'],
  'doubao-x',
);
const context: UIContext = {
  screenshot: { base64: 'data:image/png;base64,AA==' } as any,
  shotSize: { width: 1000, height: 800 },
  shrunkShotToLogicalRatio: 1,
};

function createPlanOptions(overrides: Partial<PlanOptions> = {}): PlanOptions {
  return {
    context,
    actionSpace: mockActionSpace,
    modelRuntime: {
      config: {
        modelName: 'doubao-x-test-model',
        modelFamily: 'doubao-x',
        modelDescription: 'doubao-x-test-model',
        intent: 'planning',
        slot: 'planning',
      },
      adapter,
    } as any,
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: true,
    ...overrides,
  };
}

describe('Doubao-X custom planning', () => {
  beforeEach(() => {
    vi.mocked(callAIWithStringResponse).mockReset();
  });

  it('uses the CUA demo temperature by default while allowing an explicit override', () => {
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        intent: 'planning',
        userConfig: {},
      }).config,
    ).toMatchObject({ temperature: 0.7 });
    expect(
      adapter.chatCompletion.buildChatCompletionParams({
        intent: 'planning',
        userConfig: { temperature: 0.2 },
      }).config,
    ).toMatchObject({ temperature: 0.2 });
  });

  it('builds XML65 definitions from actionSpace and maps a click to Tap', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content:
        '<seed:tool_call><function name="click"><parameter name="point" string="true">500 500</point></function></seed:tool_call>',
      usage: { total_tokens: 12 } as any,
    });

    const result = await runCustomPlanning(
      'click submit',
      createPlanOptions(),
      resolveCustomPlanningDefinition(createDoubaoXPlanner()),
    );

    const messages = vi.mocked(callAIWithStringResponse).mock.calls[0][0];
    expect(messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('"name":"click"'),
    });
    expect(messages[0]).not.toMatchObject({
      content: expect.stringContaining('"name":"right_single"'),
    });
    expect(result.actions).toMatchObject([
      {
        type: 'Tap',
        param: { locate: { locatedPixelBbox: [490, 392, 509, 407] } },
      },
    ]);
    expect(result.shouldContinuePlanning).toBe(true);
  });

  it('turns a plain-text response into Finished', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'Task completed.',
    });

    const result = await runCustomPlanning(
      'finish task',
      createPlanOptions(),
      resolveCustomPlanningDefinition(createDoubaoXPlanner()),
    );

    expect(result.actions).toEqual([
      { type: 'Finished', param: {}, thought: '' },
    ]);
    expect(result.shouldContinuePlanning).toBe(false);
  });
});
