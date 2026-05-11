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

describe('plan XML parse retry', () => {
  beforeEach(() => {
    vi.mocked(callAI).mockReset();
  });

  it('should retry once when XML response parsing fails', async () => {
    vi.mocked(callAI)
      .mockResolvedValueOnce({
        content: `<log>Tap button</log>
<action-type>Tap</action-type>
<action-param-json>{invalid json}</action-param-json>`,
      })
      .mockResolvedValueOnce({
        content: `<log>Tap button after retry</log>
<action-type>Tap</action-type>`,
      });

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

    const modelConfig: IModelConfig = {
      modelName: 'mock-model',
    };

    const result = await plan('tap the button', {
      context,
      interfaceType: 'puppeteer',
      actionSpace,
      modelConfig,
      conversationHistory: new ConversationHistory(),
      includeBbox: false,
      planningModeDeepThink: false,
      modelReasoningEnabled: false,
    });

    expect(callAI).toHaveBeenCalledTimes(2);
    expect(result.rawResponse).toContain('Tap button after retry');
    expect(result.action?.type).toBe('Tap');
    expect(result.actions).toEqual([{ type: 'Tap' }]);
  });
});
