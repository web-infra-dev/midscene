import type {
  ParsedPlanningLocateParameter,
  StandardPlanningProtocol,
} from '@/ai-model/model-adapter/planning-protocol';
import { ResolvedModelAdapter } from '@/ai-model/model-adapter/resolve';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller/index';
import { prepareUserPrompt } from '@/ai-model/shared/multimodal-prompt';
import { standardPlan as runPreparedStandardPlan } from '@/ai-model/workflows/planning';
import { ConversationHistory } from '@/ai-model/workflows/planning/conversation-history';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import {
  type TUserPrompt,
  buildYamlFlowFromPlans,
  getMidsceneLocationSchema,
} from '@/common';
import type { DeviceAction, UIContext } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import { z } from 'zod';

import * as serviceCallerActual from '@/ai-model/service-caller/index' with {
  rstest: 'importActual',
};
import * as commonActual from '@/common' with { rstest: 'importActual' };

rs.mock('@/ai-model/service-caller/index', () => ({
  ...serviceCallerActual,
  callAI: rs.fn(),
}));

rs.mock('@/common', () => ({
  ...commonActual,
  buildYamlFlowFromPlans: rs.fn(commonActual.buildYamlFlowFromPlans),
}));

const mockAIResponse = (content: string) => ({
  content,
  isStreamed: false,
});

const standardPlan = async (
  userInstruction: TUserPrompt,
  options: PlanOptions,
) => runPreparedStandardPlan(await prepareUserPrompt(userInstruction), options);

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
    call: rs.fn(),
  },
];

const latestImageDetail = () => {
  const messages = rs.mocked(callAI).mock.calls[0]?.[0];
  const latestMessage = messages?.at(-1);
  const imagePart = Array.isArray(latestMessage?.content)
    ? latestMessage.content.find((part) => part.type === 'image_url')
    : undefined;
  return imagePart?.image_url.detail;
};

const latestCallAIOptions = () => rs.mocked(callAI).mock.calls[0]?.[2];

const latestSystemPrompt = () => {
  const message = rs.mocked(callAI).mock.calls[0]?.[0]?.[0];
  return message?.role === 'system' ? message.content : undefined;
};

describe('plan XML parse retry', () => {
  beforeEach(() => {
    rs.mocked(callAI).mockReset();
    rs.mocked(buildYamlFlowFromPlans).mockClear();
  });

  it.each([
    '<planning>I need to tap the menu again.</planning>',
    '<log>Tap the menu</log>',
    '',
    '<error> </error>',
    '<complete>true</complete>',
  ])('retries incomplete planning responses: %s', async (content) => {
    rs.mocked(callAI)
      .mockResolvedValueOnce(mockAIResponse(content))
      .mockResolvedValueOnce(
        mockAIResponse('<complete success="true">Done</complete>'),
      );
    const result = await standardPlan('tap the menu', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime({ ...mockModelConfig(), retryInterval: 0 }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });
    expect(callAI).toHaveBeenCalledTimes(2);
    expect(rs.mocked(callAI).mock.calls[1]?.[0]?.at(-1)?.content).toEqual(
      expect.stringContaining('Incomplete planning response'),
    );
    expect(result.finalizeSuccess).toBe(true);
    expect(buildYamlFlowFromPlans).toHaveBeenCalledTimes(1);
  });

  it.each([
    '<complete success="true">Done</complete>',
    '<complete success="false">Unable to finish</complete>',
    '<error>Cannot perform this action</error>',
  ])('accepts valid responses without actions: %s', async (content) => {
    rs.mocked(callAI).mockResolvedValueOnce(mockAIResponse(content));
    const result = await standardPlan('tap the menu', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime({ ...mockModelConfig(), retryInterval: 0 }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(result.actions).toEqual([]);
    if (content.startsWith('<complete')) {
      expect(result.shouldContinuePlanning).toBe(false);
      expect(result.finalizeSuccess).toBe(content.includes('success="true"'));
    } else {
      expect(result.error).toBe('Cannot perform this action');
    }
  });

  it('fails after exhausting retries for planning-only responses', async () => {
    rs.mocked(callAI).mockResolvedValue(
      mockAIResponse('<planning>Tap the menu</planning>'),
    );
    await expect(
      standardPlan('tap the menu', {
        context: mockContext(),
        actionSpace: mockActionSpace(),
        modelRuntime: getModelRuntime({
          ...mockModelConfig(),
          retryInterval: 0,
        }),
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: false,
        effort: 'balance',
      }),
    ).rejects.toThrow('Incomplete planning response');
    expect(callAI).toHaveBeenCalledTimes(2);
    expect(buildYamlFlowFromPlans).not.toHaveBeenCalled();
  });

  it.each([
    '<action-type-param-json>{"locate":{"prompt":"submit"}}</action-param-json>',
    '<action-param-json>{}</action-param-json>',
    '<action-param-json>{"locate":null}</action-param-json>',
    '<action-param-json>{"locate":"submit"}</action-param-json>',
  ])('retries invalid Tap parameters: %s', async (parameters) => {
    rs.mocked(callAI)
      .mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>${parameters}`),
      )
      .mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"submit"}}</action-param-json>`),
      );

    const result = await standardPlan('tap submit', {
      context: mockContext(),
      actionSpace: [
        {
          name: 'Tap',
          description: 'Tap an element',
          paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
          call: rs.fn(),
        },
      ],
      modelRuntime: getModelRuntime({ ...mockModelConfig(), retryInterval: 0 }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(rs.mocked(callAI).mock.calls[1]?.[0]?.at(-1)?.content).toEqual(
      expect.stringContaining('Invalid parameters for action Tap: locate'),
    );
    expect(buildYamlFlowFromPlans).toHaveBeenCalledTimes(1);
    expect(result.actions?.[0]?.param).toEqual({
      locate: { prompt: 'submit' },
    });
  });

  it.each([false, true])(
    'decodes protocol locators once before validation (coordinates: %s)',
    async (includeLocateInPlanning) => {
      const runtime = getModelRuntime({
        ...mockModelConfig('qwen3-vl'),
        retryInterval: 0,
      });
      const planning = runtime.adapter.planning;
      if (planning.kind !== 'standard') {
        throw new Error('Expected a standard planning adapter');
      }
      const encodedLocate = '<prompt>submit</prompt><point>50 60</point>';
      const parseRawLocateParameter = rs.fn((value: unknown) => {
        if (value !== encodedLocate) {
          throw new Error('Unexpected encoded locator');
        }
        return { prompt: 'submit', bbox: [100, 200, 300, 400] };
      });
      rs.mocked(callAI).mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>${JSON.stringify({ locate: encodedLocate })}</action-param-json>`),
      );
      const result = await standardPlan('tap submit', {
        context: mockContext(),
        actionSpace: [
          {
            name: 'Tap',
            description: 'Tap an element',
            paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
            call: rs.fn(),
          },
        ],
        modelRuntime: {
          config: runtime.config,
          adapter: new ResolvedModelAdapter(
            {
              planning: {
                protocol: {
                  ...planning.protocol,
                  actionOutputProtocol: {
                    ...planning.protocol.actionOutputProtocol,
                    parseRawLocateParameter,
                  },
                },
              },
            },
            'test-encoded-locator',
          ),
        },
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning,
        effort: 'balance',
      });
      expect(callAI).toHaveBeenCalledTimes(1);
      expect(parseRawLocateParameter).toHaveBeenCalledTimes(1);
      expect(parseRawLocateParameter).toHaveBeenCalledWith(encodedLocate);
      expect(result.actions?.[0]?.param.locate.prompt).toBe('submit');
      if (includeLocateInPlanning) {
        expect(
          result.actions?.[0]?.param.locate.locatedPixelResult,
        ).toBeDefined();
      } else {
        expect(result.actions?.[0]?.param.locate).toEqual({ prompt: 'submit' });
      }
    },
  );

  it('retries missing locator prompts before normalizing coordinates', async () => {
    rs.mocked(callAI)
      .mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{"locate":{"bbox":["invalid"]}}</action-param-json>`),
      )
      .mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"submit","bbox":[100,200,300,400]}}</action-param-json>`),
      );
    const result = await standardPlan('tap submit', {
      context: mockContext(),
      actionSpace: [
        {
          name: 'Tap',
          description: 'Tap',
          paramSchema: z.object({ locate: getMidsceneLocationSchema() }),
          call: rs.fn(),
        },
      ],
      modelRuntime: getModelRuntime({
        ...mockModelConfig('qwen3-vl'),
        retryInterval: 0,
      }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: true,
      effort: 'balance',
    });
    expect(callAI).toHaveBeenCalledTimes(2);
    const feedback = rs.mocked(callAI).mock.calls[1]?.[0]?.at(-1)?.content;
    expect(feedback).toEqual(
      expect.stringContaining('locate.prompt: Required'),
    );
    expect(feedback).not.toEqual(expect.stringContaining('locatedPixelResult'));
    expect(result.actions?.[0]?.param.locate.locatedPixelResult.center).toEqual(
      [20, 30],
    );
  });

  it('reports parameter validation errors after retries are exhausted', async () => {
    rs.mocked(callAI).mockResolvedValue(
      mockAIResponse(`<action-type>Input</action-type>
<action-param-json>{"value":123}</action-param-json>`),
    );

    await expect(
      standardPlan('input text', {
        context: mockContext(),
        actionSpace: [
          {
            name: 'Input',
            description: 'Input text',
            paramSchema: z.object({ value: z.string() }),
            call: rs.fn(),
          },
        ],
        modelRuntime: getModelRuntime({
          ...mockModelConfig(),
          retryInterval: 0,
        }),
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: false,
        effort: 'balance',
      }),
    ).rejects.toThrow('Invalid parameters for action Input: value');
    expect(callAI).toHaveBeenCalledTimes(2);
    expect(buildYamlFlowFromPlans).not.toHaveBeenCalled();
  });

  it('keeps model parameters unchanged in actions and YAML', async () => {
    const transform = rs.fn((value: string) => value.length);
    rs.mocked(callAI).mockResolvedValue(
      mockAIResponse(`<action-type>Input</action-type>
<action-param-json>{"value":"hello"}</action-param-json>`),
    );
    const result = await standardPlan('input hello', {
      context: mockContext(),
      actionSpace: [
        {
          name: 'Input',
          description: 'input',
          paramSchema: z.object({
            value: z.string().transform(transform),
            count: z.number().default(1),
          }),
          call: rs.fn(),
        },
      ],
      modelRuntime: getModelRuntime({ ...mockModelConfig(), retryInterval: 0 }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });
    expect(result.actions).toEqual([
      { type: 'Input', param: { value: 'hello' } },
    ]);
    expect(result.yamlFlow).toEqual([{ Input: '', value: 'hello' }]);
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it('does not retry or wrap YAML generation errors', async () => {
    const error = new Error('YAML generation failed');
    rs.mocked(callAI).mockResolvedValue(
      mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{}</action-param-json>`),
    );
    rs.mocked(buildYamlFlowFromPlans).mockImplementationOnce(() => {
      throw error;
    });

    await expect(
      standardPlan('tap submit', {
        context: mockContext(),
        actionSpace: mockActionSpace(),
        modelRuntime: getModelRuntime({
          ...mockModelConfig(),
          retryInterval: 0,
        }),
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: false,
        effort: 'balance',
      }),
    ).rejects.toBe(error);
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(buildYamlFlowFromPlans).toHaveBeenCalledTimes(1);
  });

  it('retries unknown actions before generating YAML', async () => {
    rs.mocked(callAI)
      .mockResolvedValueOnce(
        mockAIResponse('<action-type>Unknown</action-type>'),
      )
      .mockResolvedValueOnce(mockAIResponse('<action-type>Tap</action-type>'));

    const result = await standardPlan('tap submit', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime({ ...mockModelConfig(), retryInterval: 0 }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      effort: 'balance',
    });
    expect(callAI).toHaveBeenCalledTimes(2);
    expect(rs.mocked(callAI).mock.calls[1]?.[0]?.at(-1)?.content).toEqual(
      expect.stringContaining(
        "Action type 'Unknown' is not in the current action space",
      ),
    );
    expect(buildYamlFlowFromPlans).toHaveBeenCalledTimes(1);
    expect(result.yamlFlow).toEqual([{ Tap: '' }]);
  });

  it('uses the action-only XML protocol for fast effort', async () => {
    rs.mocked(callAI).mockResolvedValueOnce(
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

    const systemPrompt = rs.mocked(callAI).mock.calls[0]?.[0]?.[0]?.content;
    expect(systemPrompt).not.toEqual(expect.stringContaining('<planning>'));
    expect(systemPrompt).not.toEqual(expect.stringContaining('</planning>'));
    expect(systemPrompt).not.toEqual(expect.stringContaining('<log>'));
    expect(result.thought).toBeUndefined();
    expect(result.log).toBe('{"type":"Tap","param":{}}');
    expect(result.actions).toEqual([{ type: 'Tap', param: {} }]);
  });

  it('resolves reference images from the planning instruction', async () => {
    rs.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{}</action-param-json>`),
    );

    await standardPlan(
      {
        prompt: 'tap the matching button',
        images: [
          {
            name: 'target',
            url: 'data:image/png;base64,REFERENCE==',
          },
        ],
      },
      {
        context: mockContext(),
        actionSpace: mockActionSpace(),
        modelRuntime: getModelRuntime(mockModelConfig()),
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: false,
        effort: 'fast',
      },
    );

    expect(rs.mocked(callAI).mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'image_url',
              image_url: expect.objectContaining({
                url: 'data:image/png;base64,REFERENCE==',
              }),
            }),
          ]),
        }),
      ]),
    );
  });

  it('uses model retry settings when XML response parsing fails', async () => {
    rs.mocked(callAI)
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
    const retryFeedback = rs.mocked(callAI).mock.calls[1]?.[0]?.at(-1);
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
    rs.mocked(callAI)
      .mockResolvedValueOnce({
        ...mockAIResponse(firstResponse),
        rawChoiceMessage: rawAssistantMessage,
      })
      .mockResolvedValueOnce(
        mockAIResponse(`<log>Task completed</log>
<complete success="true">Done</complete>`),
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

    const secondRequestMessages = rs.mocked(callAI).mock.calls[1]?.[0];
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
    rs.mocked(callAI)
      .mockResolvedValueOnce({
        ...mockAIResponse(firstResponse),
        rawChoiceMessage: rawAssistantMessage,
      })
      .mockResolvedValueOnce(
        mockAIResponse(
          '<log>Task completed</log>\n<complete success="true">Done</complete>',
        ),
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

    const secondRequestMessages = rs.mocked(callAI).mock.calls[1]?.[0];
    expect(secondRequestMessages).not.toContainEqual(rawAssistantMessage);
    expect(secondRequestMessages).toContainEqual({
      role: 'assistant',
      content: [{ type: 'text', text: firstResponse }],
    });
  });

  it('does not replay Responses output items as Chat Completions messages', async () => {
    const firstResponse =
      '<log>Tap button</log>\n<action-type>Tap</action-type>';
    const rawAssistantMessage = {
      role: 'assistant' as const,
      content: firstResponse,
      reasoning_content: 'Provider-specific reasoning state.',
    };
    const conversationHistory = new ConversationHistory();
    rs.mocked(callAI)
      .mockResolvedValueOnce({
        ...mockAIResponse(firstResponse),
        rawChoiceMessage: [rawAssistantMessage],
      })
      .mockResolvedValueOnce(
        mockAIResponse('<log>Task completed</log>\n<complete>true</complete>'),
      );

    const options = {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime({
        ...mockModelConfig('kimi3'),
        apiType: 'responses',
      }),
      conversationHistory,
      includeLocateInPlanning: false,
      effort: 'balance',
    } as const;

    await standardPlan('tap the button', options);
    await standardPlan('tap the button', options);

    const secondRequestMessages = rs.mocked(callAI).mock.calls[1]?.[0];
    expect(secondRequestMessages).not.toContainEqual([rawAssistantMessage]);
    expect(secondRequestMessages).toContainEqual({
      role: 'assistant',
      content: [{ type: 'text', text: firstResponse }],
    });
  });

  it('preserves retry request errors instead of reporting them as XML parse errors', async () => {
    const requestError = new Error('failed to call AI model service');
    rs.mocked(callAI)
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
    rs.mocked(callAI).mockResolvedValueOnce(
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

    const messages = rs.mocked(callAI).mock.calls[0]?.[0];
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

  it('marks planning as requiring original image detail when locate is included', async () => {
    rs.mocked(callAI).mockResolvedValueOnce(
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
        includeActionOutputExample: true,
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
        parseRawLocateParameter: (value) =>
          value as ParsedPlanningLocateParameter,
      },
    };
    rs.mocked(callAI).mockResolvedValueOnce(
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
    const jsonParser = rs.fn(() => ({ parsedByCustomParser: true }));
    rs.mocked(callAI).mockResolvedValueOnce(
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
        call: rs.fn(),
      },
    ];
    rs.mocked(callAI)
      .mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"submit","bbox":["invalid"]}}</action-param-json>`),
      )
      .mockResolvedValueOnce(
        mockAIResponse(`<action-type>Tap</action-type>
<action-param-json>{"locate":{"prompt":"submit","bbox":[100,200,300,400]}}</action-param-json>`),
      );
    const yamlFlowInputs: unknown[] = [];
    const buildYamlFlow = rs.mocked(buildYamlFlowFromPlans);
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
    expect(
      result.actions?.[0]?.param?.locate?.locatedPixelResult?.center,
    ).toEqual([20, 30]);
    expect(yamlFlowInputs).toHaveLength(1);
    expect(yamlFlowInputs[0]).toEqual([
      {
        type: 'Tap',
        param: {
          locate: {
            prompt: 'submit',
            locatedPixelResult: {
              center: [20, 30],
              rect: { left: 10, top: 20, width: 21, height: 21 },
            },
          },
        },
      },
    ]);
    expect(result.yamlFlow).toEqual([{ Tap: '', locate: 'submit' }]);
  });
});
