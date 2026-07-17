import { ConversationHistory } from '@/ai-model/conversation-history';
import { plan } from '@/ai-model/llm-planning';
import { getModelRuntime } from '@/ai-model/models';
import { callAI } from '@/ai-model/service-caller/index';
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

const mockModelConfig = (): IModelConfig => ({
  modelName: 'mock-model',
  modelDescription: 'mock model',
  intent: 'planning',
  slot: 'planning',
  retryCount: 1,
  retryInterval: 2000,
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

describe('plan XML parse retry', () => {
  beforeEach(() => {
    vi.mocked(callAI).mockReset();
    vi.mocked(buildYamlFlowFromPlans).mockClear();
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

    const result = await plan('tap the button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime({
        ...mockModelConfig(),
        retryCount: 2,
        retryInterval: 0,
      }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      deepThink: false,
    });

    expect(callAI).toHaveBeenCalledTimes(3);
    expect(result.rawResponse).toContain('Tap button after retry');
    expect(result.actions).toEqual([{ type: 'Tap' }]);
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
      plan('tap the button', {
        context: mockContext(),
        actionSpace: mockActionSpace(),
        modelRuntime: getModelRuntime(mockModelConfig()),
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: false,
        deepThink: false,
      }),
    ).rejects.toBe(requestError);

    expect(callAI).toHaveBeenCalledTimes(2);
  });

  it('should tell the model when no previous aiAct actions have been executed', async () => {
    vi.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(`<log>Tap button</log>
<action-type>Tap</action-type>`),
    );

    await plan('terminate the app, launch it, then tap the AI button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime(mockModelConfig()),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: false,
      deepThink: false,
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

  it('marks planning as requiring original image detail when locate is included', async () => {
    vi.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(`<log>Tap button</log>
<action-type>Tap</action-type>`),
    );

    await plan('tap the button', {
      context: mockContext(),
      actionSpace: mockActionSpace(),
      modelRuntime: getModelRuntime({
        ...mockModelConfig(),
        modelFamily: 'qwen3-vl',
      }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: true,
      deepThink: false,
    });

    expect(latestImageDetail()).toBe('high');
    expect(latestCallAIOptions()?.requiresOriginalImageDetail).toBe(true);
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

    const result = await plan('tap submit', {
      context: mockContext(),
      actionSpace,
      modelRuntime: getModelRuntime({
        ...mockModelConfig(),
        modelFamily: 'qwen3-vl',
      }),
      conversationHistory: new ConversationHistory(),
      includeLocateInPlanning: true,
      deepThink: false,
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
