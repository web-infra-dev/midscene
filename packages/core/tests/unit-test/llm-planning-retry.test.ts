import type { StandardPlanningProtocol } from '@/ai-model/model-adapter/planning-protocol';
import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller/index';
import { standardPlan } from '@/ai-model/workflows/planning';
import { ConversationHistory } from '@/ai-model/workflows/planning/conversation-history';
import { buildYamlFlowFromPlans, getMidsceneLocationSchema } from '@/common';
import type { DeviceAction, UIContext } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/ai-model/service-caller/index', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/service-caller/index')>();
  return {
    ...actual,
    callAI: vi.fn(),
  };
});

vi.mock('@/common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common')>();
  return {
    ...actual,
    buildYamlFlowFromPlans: vi.fn(actual.buildYamlFlowFromPlans),
  };
});

const mockAIResponse = (content: string) => ({
  content,
  isStreamed: false,
});

const mockModelConfig = (
  modelFamily?: IModelConfig['modelFamily'],
): IModelConfig => ({
  modelName: 'mock-model',
  modelDescription: 'mock model',
  intent: 'planning',
  slot: 'planning',
  retryCount: 1,
  retryInterval: 2000,
  ...(modelFamily ? { modelFamily } : {}),
});

const mockContext = (): UIContext =>
  ({
    screenshot: {
      base64: 'data:image/png;base64,AA==',
    },
    shotSize: {
      width: 100,
      height: 100,
    },
  }) as UIContext;

const mockActionSpace = (): DeviceAction[] => [
  {
    name: 'Tap',
    description: 'Tap an element',
    call: vi.fn(),
  },
];

const latestImageDetail = () => {
  const messages = vi.mocked(callAI).mock.calls[0]?.[0];
  const latestMessage = messages?.at(-1);
  const imagePart = Array.isArray(latestMessage?.content)
    ? latestMessage.content.find((part) => part.type === 'image_url')
    : undefined;
  return imagePart?.image_url.detail;
};

const latestCallAIOptions = () => vi.mocked(callAI).mock.calls[0]?.[2];

const latestSystemPrompt = () => {
  const message = vi.mocked(callAI).mock.calls[0]?.[0]?.[0];
  return message?.role === 'system' ? message.content : undefined;
};

describe('plan XML parse retry', () => {
  beforeEach(() => {
    vi.mocked(callAI).mockReset();
    vi.mocked(buildYamlFlowFromPlans).mockClear();
  });

  it('uses the action-only XML protocol for fast effort', async () => {
    vi.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{}</action-param-json>`),
    );

    const result = await standardPlan('tap the button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime(mockModelConfig()),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'fast',
    });

    const systemPrompt = vi.mocked(callAI).mock.calls[0]?.[0]?.[0]?.content;
    expect(systemPrompt).not.toEqual(expect.stringContaining('<planning>'));
    expect(systemPrompt).not.toEqual(expect.stringContaining('</planning>'));
    expect(systemPrompt).not.toEqual(expect.stringContaining('<log>'));
    expect(result.thought).toBeUndefined();
    expect(result.log).toBe('{"type":"Tap","param":{}}');
    expect(result.actions).toEqual([{ type: 'Tap', param: {} }]);
  });

  it('uses model retry settings when XML response parsing fails', async () => {
    vi.mocked(callAI)
      .mockResolvedValueOnce(
        mockAIResponse(`<log>Tap button</log>
<action-type>Tap</action-type>
<action-param-json>{invalid json}</action-param-json>`),
      )
      .mockResolvedValueOnce(
        mockAIResponse(`<log>Still invalid</log>
<action-type>Tap</action-type>
<action-param-json>{invalid json}</action-param-json>`),
      )
      .mockResolvedValueOnce(
        mockAIResponse(`<log>Tap button after retry</log>
<action-type>Tap</action-type>`),
      );

    const result = await standardPlan('tap the button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime({
        ...mockModelConfig(),
        retryCount: 2,
        retryInterval: 0,
      }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });

    expect(callAI).toHaveBeenCalledTimes(3);
    const retryFeedback = vi.mocked(callAI).mock.calls[1]?.[0]?.at(-1);
    expect(retryFeedback).toMatchObject({ role: 'user' });
    expect(retryFeedback?.content).toEqual(
      expect.stringContaining('The previous response was invalid:'),
    );
    expect(result.rawResponse).toContain('Tap button after retry');
    expect(result.actions).toEqual([{ type: 'Tap' }]);
  });

  it('replays the complete assistant message for adapters that opt in', async () => {
    const firstResponse = `<log>Tap button</log>
<action-type>Tap</action-type>`;
    const rawAssistantMessage = {
      role: 'assistant' as const,
      content: firstResponse,
      reasoning_content: 'The button is visible in the center of the screen.',
    };
    const conversationHistory = new ConversationHistory();
    vi.mocked(callAI)
      .mockResolvedValueOnce({
        ...mockAIResponse(firstResponse),
        rawChoiceMessage: rawAssistantMessage,
      })
      .mockResolvedValueOnce(
        mockAIResponse(`<log>Task completed</log>
<complete>true</complete>`),
      );

    const options = {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime(mockModelConfig('kimi3')),
      conversationHistory,
      includeLocateInPlanning: false,
      effort: 'balance',
    } as const;

    await standardPlan('tap the button', options);
    await standardPlan('tap the button', options);

    const secondRequestMessages = vi.mocked(callAI).mock.calls[1]?.[0];
    expect(secondRequestMessages).toContainEqual(rawAssistantMessage);
  });

  it('uses normalized assistant content when the adapter does not opt in', async () => {
    const firstResponse =
      '<log>Tap button</log>\n<action-type>Tap</action-type>';
    const rawAssistantMessage = {
      role: 'assistant' as const,
      content: firstResponse,
      reasoning_content: 'Provider-specific reasoning state.',
    };
    const conversationHistory = new ConversationHistory();
    vi.mocked(callAI)
      .mockResolvedValueOnce({
        ...mockAIResponse(firstResponse),
        rawChoiceMessage: rawAssistantMessage,
      })
      .mockResolvedValueOnce(
        mockAIResponse('<log>Task completed</log>\n<complete>true</complete>'),
      );

    const options = {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime(mockModelConfig()),
      conversationHistory,
      includeLocateInPlanning: false,
      effort: 'balance',
    } as const;

    await standardPlan('tap the button', options);
    await standardPlan('tap the button', options);

    const secondRequestMessages = vi.mocked(callAI).mock.calls[1]?.[0];
    expect(secondRequestMessages).not.toContainEqual(rawAssistantMessage);
    expect(secondRequestMessages).toContainEqual({
      role: 'assistant',
      content: [{ type: 'text', text: firstResponse }],
    });
  });

  it('preserves retry request errors instead of reporting them as XML parse errors', async () => {
    const requestError = new Error('failed to call AI model service');
    vi.mocked(callAI)
      .mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{invalid json}</action-param-json>`),
      )
      .mockRejectedValueOnce(requestError);

    await expect(
      standardPlan('tap the button', {
        context: mockContext(),
        actionSpace: mockActionSpace(),
        modelRuntime: getModelRuntime(mockModelConfig()),
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: false,
        effort: 'balance',
      }),
    ).rejects.toBe(requestError);

    expect(callAI).toHaveBeenCalledTimes(2);
  });

  it('should tell the model when no previous aiAct actions have been executed', async () => {
    vi.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(`<log>Tap button</log>
<action-type>Tap</action-type>`),
    );

    await standardPlan('terminate the app, launch it, then tap the AI button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime(mockModelConfig()),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });

    const messages = vi.mocked(callAI).mock.calls[0]?.[0];
    const latestMessage = messages?.at(-1);
    const textPart = Array.isArray(latestMessage?.content)
      ? latestMessage.content.find((part) => part.type === 'text')
      : undefined;

    expect(textPart?.text).toContain('This is the current screenshot.');
    expect(textPart?.text).toContain(
      'No previous actions have been executed in this aiAct execution yet.',
    );
    expect(textPart?.text).toContain(
      'If the instruction asks for actions, choose the first action to execute.',
    );
  });

  it('does not record a planning log before its action executes', async () => {
    const conversationHistory = new ConversationHistory();
    vi.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(`<log>Tap button</log>
<action-type>Tap</action-type>`),
    );

    await standardPlan('tap the button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime(mockModelConfig()),
      conversationHistory,
      includeLocateInPlanning: false,
      effort: 'balance',
    });

    expect(conversationHistory.historicalLogsToText()).toBe('');
  });

  it('marks planning as requiring original image detail when locate is included', async () => {
    vi.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(`<log>Tap button</log>
<action-type>Tap</action-type>`),
    );

    await standardPlan('tap the button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime({
        ...mockModelConfig(),
        modelFamily: 'qwen3-vl',
      }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: true,
      effort: 'balance',
    });

    expect(latestImageDetail()).toBe('high');
    expect(latestCallAIOptions()?.requiresOriginalImageDetail).toBe(true);
  });

  it('uses the standard planning protocol configured by the adapter', async () => {
    const planningProtocol: StandardPlanningProtocol = {
      actionSpaceProtocol: {
        title: 'Custom tools',
        format: 'jsonl',
        buildLocateFieldDescription: () => 'CUSTOM_LOCATE_DESCRIPTION',
        buildActionDescription: () => ({
          name: 'CUSTOM_TOOL_DEFINITION',
        }),
      },
      actionOutputProtocol: {
        actionOutputTagNames: ['custom-action'],
        actionOutputRules: 'Return one custom action.',
        actionOutputPlaceholder: '<custom-action>...</custom-action>',
        buildActionOutput: ({ actionName }) =>
          `<custom-action>${actionName}</custom-action>`,
        parseActionOutput: (content) => {
          const type = content.match(
            /<custom-action>([^<]+)<\/custom-action>/,
          )?.[1];
          return type ? { type } : null;
        },
      },
    };
    vi.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(
        '<log>Tap button</log>\n<custom-action>Tap</custom-action>',
      ),
    );

    const result = await standardPlan('tap the button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: {
        config: mockModelConfig(),
        adapter: new ResolvedModelAdapter(
          { planning: { protocol: planningProtocol } },
          'test-planning-protocol',
        ),
      },
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });

    expect(latestSystemPrompt()).toContain('### Custom tools');
    expect(latestSystemPrompt()).toContain('CUSTOM_TOOL_DEFINITION');
    expect(result.actions).toEqual([{ type: 'Tap' }]);
  });

  it('uses the JSON parser configured by the adapter for planning actions', async () => {
    const jsonParser = vi.fn(() => ({ parsedByCustomParser: true }));
    vi.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(`<log>Tap button</log>
<action-type>Tap</action-type>
<action-param-json>{custom syntax}</action-param-json>`),
    );

    const result = await standardPlan('tap the button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: {
        config: mockModelConfig(),
        adapter: new ResolvedModelAdapter(
          { jsonParser },
          'test-custom-json-parser',
        ),
      },
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });

    expect(jsonParser).toHaveBeenCalledWith('{custom syntax}', {
      source: 'planning-action-param',
      preserveStringValueKeys: undefined,
    });
    expect(result.actions).toEqual([
      {
        type: 'Tap',
        param: { parsedByCustomParser: true },
      },
    ]);
  });

  it('retries once when planning locate coordinates cannot be normalized', async () => {
    const actionSpace: DeviceAction[] = [
      {
        name: 'Tap',
        description: 'Tap an element',
        paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
        call: vi.fn(),
      },
    ];
    vi.mocked(callAI)
      .mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"submit","bbox":["invalid"]}}</action-param-json>`),
      )
      .mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"submit","bbox":[100,200,300,400]}}</action-param-json>`),
      );
    const yamlFlowInputs: unknown[] = [];
    const buildYamlFlow = vi.mocked(buildYamlFlowFromPlans);
    const originalBuildYamlFlow = buildYamlFlow.getMockImplementation();
    const captureYamlFlowInput = (
      plans: Parameters<typeof buildYamlFlowFromPlans>[0],
      currentActionSpace: Parameters<typeof buildYamlFlowFromPlans>[1],
    ) => {
      yamlFlowInputs.push(structuredClone(plans));
      return originalBuildYamlFlow!(plans, currentActionSpace);
    };
    buildYamlFlow
      .mockImplementationOnce(captureYamlFlowInput)
      .mockImplementationOnce(captureYamlFlowInput);

    const result = await standardPlan('tap submit', {
      context: mockContext(),
      actionSpace,
      modelRuntime: getModelRuntime({
        ...mockModelConfig(),
        modelFamily: 'qwen3-vl',
      }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: true,
      effort: 'balance',
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(result.actions?.[0]?.param?.locate?.locatedPixelBbox).toEqual([
      10, 20, 30, 40,
    ]);
    expect(yamlFlowInputs[1]).toEqual([
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'submit',
            bbox: [100, 200, 300, 400],
          },
        },
      },
    ]);
  });
});
