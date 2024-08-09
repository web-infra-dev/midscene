import { AiAssert } from '@/ai-model';
import { getPageDataOfTestName } from 'tests/ai-model/inspector/util';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const useModel = 'coze';
describe('assert', () => {
  it('todo pass', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const { pass } = await AiAssert({
      assertion: 'Three tasks have been added',
      context,
      useModel,
    });
    expect(pass).toBe(true);
  });

  it('todo error', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const { pass, thought } = await AiAssert({
      assertion: 'There are four tasks in the task list',
      context,
      useModel,
    });
    expect(pass).toBe(false);
  });
});
