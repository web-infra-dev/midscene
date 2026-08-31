import {
  ConversationHistory,
  standardPlan as runPreparedStandardPlan,
} from '@/ai-model';
import { getModelRuntime } from '@/ai-model/models';
import { prepareUserPrompt } from '@/ai-model/shared/multimodal-prompt';
import type { PlanOptions } from '@/ai-model/workflows/planning/types';
import type { TUserPrompt } from '@/common';
import { globalModelConfigManager } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';
import { mockActionSpace } from '../../common';
import { getContextFromFixture } from '../../evaluation';
vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const defaultModelConfig = globalModelConfigManager.getModelConfig('default');
const defaultModelRuntime = getModelRuntime(defaultModelConfig);

const standardPlan = async (
  userInstruction: TUserPrompt,
  options: PlanOptions,
) => runPreparedStandardPlan(await prepareUserPrompt(userInstruction), options);

describe('automation - planning input', () => {
  it('input value', async () => {
    const { context } = await getContextFromFixture('todo');
    const instructions = [
      'In the task input box, type learning english',
      'In the task input box, type learning english and hit Enter key',
    ];

    for (const instruction of instructions) {
      const { actions } = await standardPlan(instruction, {
        context,
        actionSpace: mockActionSpace,
        modelRuntime: defaultModelRuntime,
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: true,
        effort: 'balance',
      });
      expect(actions).toBeDefined();
      expect(actions?.length).toBeGreaterThan(0);
    }
  });

  it('input value Add, delete, correct and check', async () => {
    const { context } = await getContextFromFixture('todo-input-with-value');
    const instructions = [
      'Append " tomorrow" to the existing content in the task input box',
      // 'Replace the word "English" with "Skiing" in the existing content of the task input box. Remember to keep other unmatched content',
      // 'Delete the word "English" from the existing content in the task input box (first line) . Remember to keep the remaining content',
    ];

    for (const instruction of instructions) {
      const { actions } = await standardPlan(instruction, {
        context,
        actionSpace: mockActionSpace,
        modelRuntime: defaultModelRuntime,
        conversationHistory: new ConversationHistory(),
        includeLocateInPlanning: true,
        effort: 'balance',
      });
      expect(actions).toBeDefined();
      expect(actions?.length).toBeGreaterThan(0);
    }
  });
});
