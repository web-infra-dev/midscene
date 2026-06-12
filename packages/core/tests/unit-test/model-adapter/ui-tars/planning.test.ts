import { ConversationHistory } from '@/ai-model/conversation-history';
import { getModelRuntime } from '@/ai-model/models';
import { ResolvedModelAdapter } from '@/ai-model/models/resolved';
import { uiTarsAdapters } from '@/ai-model/models/ui-tars/adapter';
import { uiTarsPlanning } from '@/ai-model/models/ui-tars/planning';
import { callAIWithStringResponse } from '@/ai-model/service-caller/index';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { PlanningAction, UIContext } from '@/types';
import { UITarsModelVersion } from '@midscene/shared/env';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
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

const uiTarsAdapter = new ResolvedModelAdapter(
  uiTarsAdapters['vlm-ui-tars'],
  'vlm-ui-tars',
);

function createPlanOptions(overrides: Partial<PlanOptions> = {}): PlanOptions {
  return {
    context,
    actionSpace: [],
    modelRuntime,
    conversationHistory: new ConversationHistory(),
    includeLocateInPlanning: true,
    ...overrides,
  };
}

type UiTarsActionParam = {
  locate?: Record<string, unknown>;
  from?: Record<string, unknown>;
  to?: Record<string, unknown>;
  value?: string;
  keyName?: string;
  direction?: string;
  timeMs?: number;
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

  it('runs UI-TARS planning through the resolved adapter planFn', async () => {
    expect(uiTarsAdapter.planning.kind).toBe('custom');
    if (uiTarsAdapter.planning.kind !== 'custom') {
      throw new Error('UI-TARS should use custom planning adapter');
    }
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Click submit
Action: click(start_box='(500,500)')`,
    });

    const result = await uiTarsAdapter.planning.planFn(
      'click submit',
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

  it('transforms bbox-wrapped click coordinates before parsing', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Click converted bbox
Action: click(start_box='<bbox>400 300 600 700</bbox>')`,
    });

    const result = await uiTarsPlanning(
      'click converted bbox',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const action = firstAction(result);

    expect(action).toMatchObject({
      type: 'Tap',
      param: {
        locate: {
          prompt: 'Click converted bbox',
          locatedPixelBbox: [490, 392, 509, 407],
        },
      },
    });
  });

  it('transforms right click coordinates into RightClick', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Open context menu
Action: right_single(start_box='(200,250)')`,
    });

    const result = await uiTarsPlanning(
      'open context menu',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const action = firstAction(result);

    expect(action).toMatchObject({
      type: 'RightClick',
      param: {
        locate: {
          prompt: 'Open context menu',
          locatedPixelBbox: [190, 192, 210, 208],
        },
      },
      thought: 'Open context menu',
    });
  });

  it('transforms double click coordinates into DoubleClick', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Open item
Action: left_double(start_box='(250,300)')`,
    });

    const result = await uiTarsPlanning(
      'open item',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const action = firstAction(result);

    expect(action).toMatchObject({
      type: 'DoubleClick',
      param: {
        locate: {
          prompt: 'Open item',
          locatedPixelBbox: [240, 232, 260, 248],
        },
      },
      thought: 'Open item',
    });
  });

  it('transforms type, scroll, hotkey, and wait actions', async () => {
    vi.mocked(callAIWithStringResponse)
      .mockResolvedValueOnce({
        content: `Thought: Type a query
Action: type(content='hello world')`,
        usage: { total_tokens: 33 } as any,
        rawChoiceMessage: { role: 'assistant', content: 'raw choice' } as any,
      })
      .mockResolvedValueOnce({
        content: `Thought: Scroll results
Action: scroll(direction='down')`,
      })
      .mockResolvedValueOnce({
        content: `Thought: Select all
Action: hotkey(key='ctrl+a')`,
      })
      .mockResolvedValueOnce({
        content: `Thought: Wait for loading
Action: wait()`,
      });

    const typeResult = await uiTarsPlanning(
      'type a query',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const scrollResult = await uiTarsPlanning(
      'scroll results',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const hotkeyResult = await uiTarsPlanning(
      'select all',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );
    const waitResult = await uiTarsPlanning(
      'wait for loading',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );

    expect(typeResult.actions).toMatchObject([
      {
        type: 'Input',
        param: { value: 'hello world' },
        thought: 'Type a query',
      },
    ]);
    expect(scrollResult.actions).toMatchObject([
      {
        type: 'Scroll',
        param: { direction: 'down' },
        thought: 'Scroll results',
      },
    ]);
    expect(hotkeyResult.actions).toMatchObject([
      {
        type: 'KeyboardPress',
        param: { keyName: 'ctrl+a' },
        thought: 'Select all',
      },
    ]);
    expect(waitResult.actions).toMatchObject([
      {
        type: 'Sleep',
        param: { timeMs: 1000 },
        thought: 'Wait for loading',
      },
    ]);
    expect(typeResult.shouldContinuePlanning).toBe(true);
    expect(typeResult.usage).toEqual({ total_tokens: 33 });
    expect(typeResult.rawChoiceMessage).toEqual({
      role: 'assistant',
      content: 'raw choice',
    });
  });

  it('transforms multiple actions separated inside one UI-TARS Action block', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Type a query
Action: type(content='hello world')

scroll(direction='down')`,
    });

    const result = await uiTarsPlanning(
      'type and scroll',
      createPlanOptions(),
      UITarsModelVersion.V1_0,
    );

    expect(result.actions).toMatchObject([
      {
        type: 'Input',
        param: { value: 'hello world' },
        thought: 'Type a query',
      },
      {
        type: 'Scroll',
        param: { direction: 'down' },
        thought: 'Type a query',
      },
    ]);
  });

  it('ignores hotkey actions without a key and reports no transformed action', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Missing key
Action: hotkey()`,
      usage: { total_tokens: 7 } as any,
    });

    await expect(
      uiTarsPlanning(
        'press a missing hotkey',
        createPlanOptions(),
        UITarsModelVersion.V1_0,
      ),
    ).rejects.toMatchObject({
      name: 'AIResponseParseError',
      usage: { total_tokens: 7 },
    });
  });

  it('reports unhandled UI-TARS action types when no action is transformed', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Use unsupported action
Action: screenshot()`,
    });

    await expect(
      uiTarsPlanning(
        'take screenshot',
        createPlanOptions(),
        UITarsModelVersion.V1_0,
      ),
    ).rejects.toMatchObject({
      name: 'AIResponseParseError',
      message: expect.stringContaining('Unhandled action types: screenshot'),
    });
  });

  it('reports empty UI-TARS responses without Thought details', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: '',
    });

    await expect(
      uiTarsPlanning(
        'do something',
        createPlanOptions(),
        UITarsModelVersion.V1_0,
      ),
    ).rejects.toThrow('No actions found in UI-TARS response.');
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

  it('passes action context, reference images, and abort signal to the model call', async () => {
    const abortController = new AbortController();
    const referenceImageMessages: ChatCompletionMessageParam[] = [
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
      content: `Thought: Click submit
Action: click(start_box='(500,500)')`,
    });

    await uiTarsPlanning(
      'click submit',
      createPlanOptions({
        actionContext: 'prefer the primary submit button',
        referenceImageMessages,
        conversationHistory,
        abortSignal: abortController.signal,
      }),
      UITarsModelVersion.V1_0,
    );

    const [messages, runtime, callOptions] = vi.mocked(callAIWithStringResponse)
      .mock.calls[0];
    expect(runtime).toBe(modelRuntime);
    expect(callOptions).toEqual({ abortSignal: abortController.signal });
    expect(messages[0]).toMatchObject({
      role: 'user',
      content: expect.stringContaining(
        '<high_priority_knowledge>prefer the primary submit button</high_priority_knowledge>',
      ),
    });
    expect(messages).toContain(referenceImageMessages[0]);
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
  });

  it('wraps malformed UI-TARS planning responses with raw response and usage', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: 'Thought: I know what to do, but no action line.',
      usage: { total_tokens: 5 } as any,
      rawChoiceMessage: { role: 'assistant', content: 'bad response' } as any,
    });

    await expect(
      uiTarsPlanning(
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

  it('wraps invalid UI-TARS point data parse failures', async () => {
    vi.mocked(callAIWithStringResponse).mockResolvedValueOnce({
      content: `Thought: Click invalid point
Action: click(start_box='(abc,500)')`,
      usage: { total_tokens: 9 } as any,
    });

    await expect(
      uiTarsPlanning(
        'click invalid point',
        createPlanOptions(),
        UITarsModelVersion.V1_0,
      ),
    ).rejects.toThrow(/invalid point data for ui-tars planning/);
  });
});
