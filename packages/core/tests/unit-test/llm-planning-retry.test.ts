import { ConversationHistory } from '@/ai-model/conversation-history';
import { plan } from '@/ai-model/llm-planning';
import { callAI } from '@/ai-model/service-caller/index';
import type { DeviceAction, UIContext } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller/index', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/service-caller/index')>();
  return {
    ...actual,
    callAI: vi.fn(),
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
});

describe('plan XML parse retry', () => {
  beforeEach(() => {
    vi.mocked(callAI).mockReset();
  });

  it('should retry once when XML response parsing fails', async () => {
    vi.mocked(callAI)
      .mockResolvedValueOnce(
        mockAIResponse(`<log>Tap button</log>
<action-type>Tap</action-type>
<action-param-json>{invalid json}</action-param-json>`),
      )
      .mockResolvedValueOnce(
        mockAIResponse(`<log>Tap button after retry</log>
<action-type>Tap</action-type>`),
      );

    const context = {
      screenshot: {
        base64: 'data:image/png;base64,AA==',
      },
      shotSize: {
        width: 100,
        height: 100,
      },
    } as UIContext;

    const actionSpace: DeviceAction[] = [
      {
        name: 'Tap',
        description: 'Tap an element',
        call: vi.fn(),
      },
    ];

    const result = await plan('tap the button', {
      context,
      interfaceType: 'puppeteer',
      actionSpace,
      modelConfig: mockModelConfig(),
      conversationHistory: new ConversationHistory(),
      includeBbox: false,
      deepThink: false,
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(result.rawResponse).toContain('Tap button after retry');
    expect(result.actions).toEqual([{ type: 'Tap' }]);
  });

  it('should tell the model when no previous aiAct actions have been executed', async () => {
    vi.mocked(callAI).mockResolvedValueOnce(
      mockAIResponse(`<log>Tap button</log>
<action-type>Tap</action-type>`),
    );

    const context = {
      screenshot: {
        base64: 'data:image/png;base64,AA==',
      },
      shotSize: {
        width: 100,
        height: 100,
      },
    } as UIContext;

    const actionSpace: DeviceAction[] = [
      {
        name: 'Tap',
        description: 'Tap an element',
        call: vi.fn(),
      },
    ];

    await plan('terminate the app, launch it, then tap the AI button', {
      context,
      interfaceType: 'puppeteer',
      actionSpace,
      modelConfig: mockModelConfig(),
      conversationHistory: new ConversationHistory(),
      includeBbox: false,
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
});
