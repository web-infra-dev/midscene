import Insight from '@/insight';
import { sleep } from '@/utils';
import { getContextFromFixture } from 'tests/evaluation';
<<<<<<< HEAD
import { expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

test('insight locate with search area', async () => {
  const { context } = await getContextFromFixture('taobao');

  const insight = new Insight(context);
  const { element } = await insight.locate({
    prompt: '购物车 icon',
    searchArea: '顶部购物车栏目',
  });
  expect(element).toBeDefined();

  await sleep(3000);
});

test('insight locate with search area and think twice', async () => {
  const { context } = await getContextFromFixture('taobao');

  const insight = new Insight(context);
  const { element } = await insight.locate({
    prompt: '顶部购物车 icon',
    deepThink: true,
  });
  expect(element).toBeDefined();
  await sleep(3000);
});
=======
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
>>>>>>> ba96da7 (feat: enable search area for locate)
