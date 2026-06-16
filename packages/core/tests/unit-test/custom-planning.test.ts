import { ConversationHistory } from '@/ai-model/conversation-history';
import { buildCustomPlanningMessages } from '@/ai-model/workflows/planning/custom-planning';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import { describe, expect, it } from 'vitest';

function createPlanOptions(
  conversationHistory = new ConversationHistory(),
): PlanOptions {
  return {
    context: {
      screenshot: {
        base64: 'data:image/png;base64,SCREENSHOT==',
      } as any,
      shotSize: {
        width: 1000,
        height: 800,
      },
      shrunkShotToLogicalRatio: 1,
    },
    actionSpace: [],
    modelRuntime: {
      config: {
        modelName: 'test-model',
        modelDescription: 'test-model',
        intent: 'planning',
        slot: 'planning',
      },
    } as any,
    conversationHistory,
    includeLocateInPlanning: true,
  };
}

describe('custom planning messages', () => {
  it('consumes pending feedback in the latest screenshot message', () => {
    const conversationHistory = new ConversationHistory();
    conversationHistory.pendingFeedbackMessage =
      'Current time: 2026-06-16 19:35:17 (YYYY-MM-DD HH:mm:ss)';

    const messages = buildCustomPlanningMessages(
      {
        userInstruction: 'click save',
        userInstructionText: 'click save',
        options: createPlanOptions(conversationHistory),
      },
      {
        systemPromptPlacement: 'system-message',
        buildSystemPrompt: () => 'system prompt',
        historyImageLimit: 1,
      },
    );

    expect(conversationHistory.pendingFeedbackMessage).toBe('');
    expect(messages.at(-2)).toEqual(
      expect.objectContaining({
        role: 'user',
        content: [
          expect.objectContaining({
            type: 'text',
            text: expect.stringContaining(
              'Current time: 2026-06-16 19:35:17 (YYYY-MM-DD HH:mm:ss). The previous action has been executed',
            ),
          }),
        ],
      }),
    );
    expect(messages.at(-1)).toEqual(
      expect.objectContaining({
        role: 'user',
        content: [
          expect.objectContaining({
            type: 'image_url',
            image_url: expect.objectContaining({
              url: 'data:image/png;base64,SCREENSHOT==',
            }),
          }),
        ],
      }),
    );
  });
});
