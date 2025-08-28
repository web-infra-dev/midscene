import { AiExtractElementInfo } from '@/ai-model';
import {
  type IModelPreferences,
  globalConfigManager,
} from '@midscene/shared/env';
import { getContextFromFixture } from 'tests/evaluation';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const defaultModelPreferences: IModelPreferences = {
  intent: 'default',
};

beforeAll(async () => {
  await globalConfigManager.init();
});

describe('extract', () => {
  it('todo', async () => {
    const { context } = await getContextFromFixture('todo-input-with-value');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery: 'Array<string>, task list, task name as string',
      context,
      modelPreferences: defaultModelPreferences,
    });
    expect(parseResult).toBeDefined();
    expect((parseResult.data as string[]).length).toBeGreaterThanOrEqual(3);
    // expect(parseResult).toMatchSnapshot();
  });

  it('online order', async () => {
    const { context } = await getContextFromFixture('online_order');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery: '{name: string, price: string}[], 饮品名称和价格',
      context,
      modelPreferences: defaultModelPreferences,
    });

    // Remove the thought field since it's generated dynamically by AI
    // but keep data and errors fields
    const snapshotResult = {
      data: parseResult.data,
      errors: parseResult.errors || [],
    };
    expect(snapshotResult).toMatchSnapshot();
  });

  it('todo obj', async () => {
    const { context } = await getContextFromFixture('todo-input-with-value');

    const { parseResult } = await AiExtractElementInfo({
      dataQuery:
        '{checked: boolean; text: string;}[], Task list with checkbox ahead of the task name (checkbox is a round box), task name as string and `checked` is true if the task is completed. Exclude the fist row if there is no round checkbox ahead of the task name.',
      context,
      modelPreferences: defaultModelPreferences,
    });

    // Remove the thought field since it's generated dynamically by AI
    // but keep data and errors fields
    const snapshotResult = {
      data: parseResult.data,
      errors: parseResult.errors || [],
    };
    expect(snapshotResult).toMatchSnapshot();
  });
});
