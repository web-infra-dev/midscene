import { AiAssert } from '@/ai-model';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';
import { getPageDataOfTestName } from '../evaluate/test-suite/util';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

describe('assert', () => {
  it('todo pass', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const {
      content: { pass },
    } = await AiAssert({
      assertion: 'Three tasks have been added',
      context,
    });
    expect(pass).toBe(true);
  });

  it('todo error', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const {
      content: { pass, thought },
    } = await AiAssert({
      assertion: 'There are four tasks in the task list',
      context,
    });
    expect(pass).toBe(false);
  });
});
