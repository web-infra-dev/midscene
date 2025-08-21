import { distance } from '@/ai-model/prompt/util';
import Insight from '@/insight';
import { sleep } from '@/utils';
import { vlLocateMode } from '@midscene/shared/env';
import { getContextFromFixture } from 'tests/evaluation';
import { describe, expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 60 * 1000,
});

const vlMode = vlLocateMode({ intent: 'grounding' });

describe.skipIf(!vlMode)('insight locate with deep think', () => {
  test('insight locate with search area', async () => {
    console.log('building insight context start');
    const { context } = await getContextFromFixture('taobao');
    console.log('building insight context done');

    const insight = new Insight(context);
    const { element } = await insight.locate({
      prompt: '购物车 icon',
      deepThink: true,
    });
    expect(element).toBeDefined();

    await sleep(3000);
  });

  test('insight locate with search area - deep think', async () => {
    console.log('building insight context start');
    const { context } = await getContextFromFixture('taobao');
    console.log('building insight context done');

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

describe(
  'insight describe',
  {
    timeout: 2 * 60 * 1000,
  },
  () => {
    test('insight describe - by rect', async () => {
      const { context } = await getContextFromFixture('taobao');
      const insight = new Insight(context);
      const { description } = await insight.describe({
        left: 580,
        top: 140,
        width: 80,
        height: 30,
      });

      expect(description).toBeDefined();
    });

    test('insight describe - by center point', async () => {
      const { context } = await getContextFromFixture('taobao');
      const insight = new Insight(context);
      const { description } = await insight.describe([580, 140]);

      expect(description).toBeDefined();
    });
  },
);

test.skip('insight locate with search area', async () => {
  const { context } = await getContextFromFixture('image-only');

  const insight = new Insight(context);
  const { element, rect } = await insight.locate({
    prompt: '-',
    deepThink: true,
  });
  console.log(element, rect);
  await sleep(3000);
});
