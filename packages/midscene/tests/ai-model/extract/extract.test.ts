import { AiExtractElementInfo } from '@/ai-model';
import { useCozeModel } from '@/ai-model/coze';
import { getPageDataOfTestName } from 'tests/ai-model/inspector/util';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const useModel = undefined;

const modelList: Array<'openAI' | 'coze'> = ['openAI'];

if (useCozeModel('coze')) {
  modelList.push('coze');
}

modelList.forEach((model) => {
  describe(`assert ${model}`, () => {
    it('todo', async () => {
      const { context } = await getPageDataOfTestName('todo');

      const { parseResult } = await AiExtractElementInfo({
        dataQuery: 'Array<string>, Complete task list, string is the task',
        context,
        useModel: model,
      });
      expect(parseResult).toMatchSnapshot();
    });

    it('online order', async () => {
      const { context } = await getPageDataOfTestName('online_order');

      const { parseResult } = await AiExtractElementInfo({
        dataQuery: '{name: string, price: string}[], 饮品名称和价格',
        context,
        useModel: model,
      });
      expect(parseResult).toMatchSnapshot();
    });

    it('todo obj', async () => {
      const { context } = await getPageDataOfTestName('todo');

      const { parseResult } = await AiExtractElementInfo({
        dataQuery:
          '{checked: boolean; text: string}[],Complete task list, string is the task',
        context,
        useModel: model,
      });
      expect(parseResult).toMatchSnapshot();
    });
  });
});
