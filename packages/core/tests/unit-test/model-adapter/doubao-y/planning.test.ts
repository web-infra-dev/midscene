import { ConversationHistory } from '@/ai-model/conversation-history';
import { plan } from '@/ai-model/llm-planning';
import { getModelAdapter } from '@/ai-model/models/registry';
import { callAI } from '@/ai-model/service-caller/index';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { UIContext } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { mockActionSpace } from '../../../common';

const serviceCallerMock = vi.hoisted(() => ({ callAI: vi.fn() }));

vi.mock('@/ai-model/service-caller/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ai-model/service-caller/index')>()),
  ...serviceCallerMock,
}));

const context: UIContext = {
  screenshot: { base64: 'data:image/png;base64,AA==' } as any,
  shotSize: { width: 1000, height: 800 },
  shrunkShotToLogicalRatio: 1,
};

function createPlanOptions(): PlanOptions {
  return {
    context,
    actionSpace: mockActionSpace,
    modelRuntime: {
      config: {
        modelName: 'doubao-y-test-model',
        modelFamily: 'doubao-y',
        modelDescription: 'doubao-y-test-model',
        intent: 'planning',
        slot: 'planning',
      },
      adapter: getModelAdapter('doubao-y'),
    },
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: false,
  } as PlanOptions;
}

describe('Doubao-Y Seed CUA planning', () => {
  beforeEach(() => vi.mocked(callAI).mockReset());

  it('uses Midscene action names in a Seed function prompt and parses the XML call', async () => {
    vi.mocked(callAI).mockResolvedValueOnce({
      content:
        '<think_never_used_51bce0c785ca2f68081bfa7d91973934>reasoning</think_never_used_51bce0c785ca2f68081bfa7d91973934><planning>The submit button is visible.</planning><seed:tool_call><function name="Tap"><parameter name="locate" string="true"><point>500 500</point></parameter></function></seed:tool_call>',
    });

    const options = createPlanOptions();
    const result = await plan('submit the form', options);
    const systemPrompt = vi.mocked(callAI).mock.calls[0][0][0]
      .content as string;

    expect(systemPrompt).toContain('"name":"Tap"');
    expect(systemPrompt).toContain('<seed:tool_call>');
    expect(systemPrompt).not.toContain('<action-type>');
    expect(systemPrompt).toContain(
      'This MUST be the first content in every response. It separates reasoning from the protocol output.',
    );
    expect(systemPrompt).toContain(
      '<parameter name="locate" string="true"><point>500 500</point></parameter>',
    );
    expect(result.actions).toEqual([
      {
        type: 'Tap',
        param: {
          locate: {
            point: [500, 500],
            locatedPixelBbox: [490, 392, 509, 407],
          },
        },
      },
    ]);
  });

  it('uses the same chat-completion parameters as doubao-seed', () => {
    const input = {
      intent: 'planning',
      userConfig: {},
    } as const;

    expect(
      getModelAdapter('doubao-y').chatCompletion.buildChatCompletionParams(
        input,
      ),
    ).toEqual(
      getModelAdapter('doubao-seed').chatCompletion.buildChatCompletionParams(
        input,
      ),
    );
  });

  it('treats a Seed response without a tool call as completion', async () => {
    vi.mocked(callAI).mockResolvedValueOnce({ content: 'Task completed.' });

    const result = await plan('finish task', createPlanOptions());

    expect(result.actions).toEqual([]);
    expect(result.shouldContinuePlanning).toBe(false);
    expect(result.finalizeMessage).toBe('Task completed.');
  });

  it('softly ignores unknown parameters and accepts reordered parameter attributes', async () => {
    vi.mocked(callAI).mockResolvedValueOnce({
      content:
        '<seed:tool_call><function name="Input"><parameter string="true" name="value">John</parameter><parameter name="unexpected" string="true">ignored</parameter></function></seed:tool_call>',
    });

    const result = await plan('fill name', createPlanOptions());

    expect(result.actions).toEqual([
      { type: 'Input', param: { value: 'John' } },
    ]);
  });

  it('preserves Midscene Zod enum constraints in the Seed function schema', async () => {
    vi.mocked(callAI).mockResolvedValueOnce({ content: 'Task completed.' });
    const options = createPlanOptions();
    options.actionSpace = [
      {
        name: 'Scroll',
        description: 'Scroll the current page.',
        paramSchema: z.object({
          direction: z.enum(['down', 'up', 'right', 'left']),
        }),
        call: async () => {},
      },
    ];

    await plan('scroll down', options);

    const systemPrompt = vi.mocked(callAI).mock.calls[0][0][0]
      .content as string;
    expect(systemPrompt).toContain(
      '"type":"string","description":"Parameter direction for Scroll.","enum":["down","up","right","left"]',
    );
  });
});
