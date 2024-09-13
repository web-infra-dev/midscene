import { plan } from '@/ai-model';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';
import { makePlanResultStable, modelList } from '../util';
import { getPageDataOfTestName, repeat } from './test-suite/util';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

modelList.forEach((model) => {
  describe(`automation - planning input - ${model}`, () => {
    repeat(5, () =>
      it('input value', async () => {
        const { context } = await getPageDataOfTestName('todo');
        const instructions = [
          'In the taskbar, type learning english',
          'In the taskbar, type learning english and hit Enter key',
        ];

        for (const instruction of instructions) {
          const { plans } = await plan(instruction, { context }, model);
          const res = makePlanResultStable(plans);
          expect(res).toMatchSnapshot();
        }
      }),
    );

    repeat(5, () =>
      it('input value Add, delete, correct and check', async () => {
        const { context } = await getPageDataOfTestName(
          'todo-input-with-value',
        );
        const instructions = [
          'Append "tomorrow" to the existing content in the task input box',
          'Replace "English" with "Skiing" in the existing content of the task input box',
          'Delete "English" from the existing content in the task input box',
        ];

        for (const instruction of instructions) {
          const { plans } = await plan(instruction, { context }, model);
          const res = makePlanResultStable(plans);
          expect(res).toMatchSnapshot();
        }
      }),
    );
  });
});
