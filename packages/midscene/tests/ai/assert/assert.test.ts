import { AiAssert } from '@/ai-model';
import { useCozeModel } from '@/ai-model/coze';
import { getPageDataOfTestName } from 'tests/ai/inspector/util';
/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const modelList: Array<'openAI' | 'coze'> = ['openAI'];

if (useCozeModel('coze')) {
  modelList.push('coze');
}

modelList.forEach((model) => {
  describe('assert', () => {
    it('todo pass', async () => {
      const { context } = await getPageDataOfTestName('todo');

      const { pass } = await AiAssert({
        assertion: 'Three tasks have been added',
        context,
        useModel: model,
      });
      expect(pass).toBe(true);
    });

    it('todo error', async () => {
      const { context } = await getPageDataOfTestName('todo');

      const { pass, thought } = await AiAssert({
        assertion: 'There are four tasks in the task list',
        context,
        useModel: model,
      });
      expect(pass).toBe(false);
    });
  });
});
