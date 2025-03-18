import Insight from '@/insight';
import { sleep } from '@/utils';
import { getContextFromFixture } from 'tests/evaluation';
import { expect, test } from 'vitest';

test(
  'insight locate with search area',
  async () => {
    const { context } = await getContextFromFixture('taobao');

    const insight = new Insight(context);
    const { element } = await insight.locate({
      prompt: '购物车 icon',
      searchArea: '顶部购物车栏目',
    });
    expect(element).toBeDefined();

    await sleep(3000);
  },
  {
    timeout: 60 * 1000,
  },
);
