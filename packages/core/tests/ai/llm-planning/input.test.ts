import { plan } from '@/ai-model';
import type { DeviceAction, PlanningAction } from '@/types';
import { getContextFromFixture } from 'tests/evaluation';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const mockActionSpace: DeviceAction[] = [
  {
    name: 'Input',
    description: 'Replace the input field with a new value',
    paramSchema: '{ value: string }',
    paramDescription:
      '`value` is the final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. Giving a blank string means clear the input field.',
    location: 'required',
    whatToLocate: 'The input field to be filled',
    call: () => {},
  },
];

describe('automation - planning input', () => {
  it('input value', async () => {
    const { context } = await getContextFromFixture('todo');
    const instructions = [
      'In the taskbar, type learning english',
      'In the taskbar, type learning english and hit Enter key',
    ];

    for (const instruction of instructions) {
      const { actions } = await plan(instruction, {
        context,
        actionSpace: mockActionSpace,
        pageType: 'puppeteer',
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
      const { actions } = await plan(instruction, {
        context,
        actionSpace: mockActionSpace,
        pageType: 'puppeteer',
      });
      expect(actions).toBeDefined();
      expect(actions?.length).toBeGreaterThan(0);
    }
  });
});
