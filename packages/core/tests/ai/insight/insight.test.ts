import { distance } from '@/ai-model/prompt/util';
import { vlLocateMode } from '@/env';
import Insight from '@/insight';
import { sleep } from '@/utils';
import { getContextFromFixture } from 'tests/evaluation';
import { describe, expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

const vlMode = vlLocateMode();

describe.skipIf(!vlMode)('insight locate with search area', () => {
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
    const { element, rect } = await insight.locate({
      prompt: '顶部购物车 icon',
      deepThink: true,
    });
    expect(element).toBeDefined();
    expect(rect).toBeDefined();
    expect(
      distance(
        {
          x: element!.rect.left,
          y: element!.rect.top,
        },
        {
          x: rect!.left,
          y: rect!.top,
        },
      ),
    ).toBeLessThan(100);
    await sleep(3000);
  });
});

vi.setConfig({
  testTimeout: 60 * 1000,
});

test(
  'insight locate with search area',
  async () => {
    const { context } = await getContextFromFixture('taobao');

    await sleep(3000);
  },
  {
    timeout: 60 * 1000,
  },
);
