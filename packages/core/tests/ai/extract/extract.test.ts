import { AiExtractElementInfo } from '@/ai-model';
import { getContextFromFixture } from '@/evaluation';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

describe('extract', () => {
  it('todo', async () => {
    const { context } = await getContextFromFixture('todo-input-with-value');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery: 'Array<string>, Complete task list, string is the task',
      context,
    });
    expect(parseResult).toMatchSnapshot();
  });

  it('online order', async () => {
    const { context } = await getContextFromFixture('online_order');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery: '{name: string, price: string}[], 饮品名称和价格',
      context,
    });
    expect(parseResult).toMatchSnapshot();
  });

  it('todo obj', async () => {
    const { context } = await getContextFromFixture('todo-input-with-value');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery:
        '{checked: boolean; text: string;}[], Task list with checkbox ahead of the task name (checkbox is a round box), task name as string and `checked` is true if the task is completed. Exclude the fist row if there is no round checkbox ahead of the task name.',
      context,
    });
    expect(parseResult).toMatchSnapshot();
  });
});
