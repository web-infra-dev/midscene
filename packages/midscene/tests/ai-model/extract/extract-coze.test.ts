import { AiExtractElementInfo } from '@/ai-model';
import { getPageDataOfTestName } from 'tests/ai-model/inspector/util';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const useModel = 'coze';

describe('assert', () => {
  it('todo', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery: 'Array<string>, Complete task list, string is the task',
      context,
      useModel,
    });
    expect(parseResult).toMatchSnapshot();
  });

  // it('online order', async () => {
  //   const { context } = await getPageDataOfTestName('online_order');

  //   const { parseResult } = await AiExtractElementInfo({
  //     dataQuery: '{name: string, price: string}[], 饮品名称和价格',
  //     context,
  //     useModel,
  //   });
  //   expect(parseResult).toMatchSnapshot();
  // });

  it('todo obj', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery:
        '{checked: boolean; text: string}[],Complete task list, string is the task',
      context,
      useModel,
    });
    expect(parseResult).toMatchSnapshot();
  });
});
