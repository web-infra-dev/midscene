import { plan } from '@/ai-model';
import { getContextFromFixture } from '@/evaluation';
import type { PlanningAction } from '@/types';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

function makePlanResultStable(plans: PlanningAction[]) {
  return plans.map((plan) => {
    // Removing thinking makes the results stable for snapshot testing
    plan.thought = undefined;
    if (plan.param?.prompt) {
      plan.param.prompt = '';
    }
    if ('quickAnswer' in plan && plan.quickAnswer) {
      plan.quickAnswer = {
        reason: '',
        text: '',
      };
    }

    plans.forEach((plan) => {
      if (plan.locate?.prompt) {
        plan.locate.prompt = '';
      }
    });
    return plan;
  });
}

describe('automation - planning input', () => {
  it('input value', async () => {
    const { context } = await getContextFromFixture('todo');
    const instructions = [
      'In the taskbar, type learning english',
      'In the taskbar, type learning english and hit Enter key',
    ];

    for (const instruction of instructions) {
      const { actions } = await plan(instruction, { context });
      const res = makePlanResultStable(actions!);
      expect(res).toMatchSnapshot();
    }
  });

  it('input value Add, delete, correct and check', async () => {
    const { context } = await getContextFromFixture('todo-input-with-value');
    const instructions = [
      'Append "tomorrow" to the existing content in the task input box',
      'Replace "English" with "Skiing" in the existing content of the task input box',
      'Delete "English" from the existing content in the task input box',
    ];

    for (const instruction of instructions) {
      const { actions } = await plan(instruction, { context });
      const res = makePlanResultStable(actions!);
      expect(res).toMatchSnapshot();
    }
  });
});
