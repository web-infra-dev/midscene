import { AiExtractElementInfo } from '@/ai-model';
import { describe, expect, it, vi } from 'vitest';
import { getPageDataOfTestName } from '../evaluate/test-suite/util';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

describe('extract', () => {
  it('todo', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery: 'Array<string>, Complete task list, string is the task',
      context,
    });
    expect(parseResult).toMatchSnapshot();
  });

  it('online order', async () => {
    const { context } = await getPageDataOfTestName('online_order');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery: '{name: string, price: string}[], 饮品名称和价格',
      context,
    });
    expect(parseResult).toMatchSnapshot();
  });

  it('todo obj', async () => {
    const { context } = await getPageDataOfTestName('todo');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery:
        '{checked: boolean; text: string}[],Complete task list, string is the task',
      context,
    });
    expect(parseResult).toMatchSnapshot();
  });
});
