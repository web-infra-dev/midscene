import { plan } from '@/ai-model';
import type { PlanningAction } from '@/types';
import { getContextFromFixture } from 'tests/evaluation';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

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
        pageType: 'puppeteer',
      });
      expect(actions).toBeDefined();
      expect(actions?.length).toBeGreaterThan(0);
    }
  });
});
