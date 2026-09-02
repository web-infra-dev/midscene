import { getModelRuntime } from '@/ai-model/models';
import Service from '@/service';
import { sleep } from '@/utils';
import { globalModelConfigManager } from '@midscene/shared/env';
import { describe, expect, rs, test } from '@rstest/core';
import { getContextFromFixture } from '../../evaluation';

rs.setConfig({
  testTimeout: 120 * 1000,
});

const modelConfig = () => globalModelConfigManager.getModelConfig('insight');
const modelRuntime = () => getModelRuntime(modelConfig());
const hasModelFamily = (() => {
  try {
    return Boolean(modelConfig().modelFamily);
  } catch {
    return false;
  }
})();
const locateTestOptions = {
  // Allow three 180s model attempts plus two 60s retry intervals.
  timeout: 12 * 60 * 1000,
  retry: 0,
};

function distance(
  point1: { x: number; y: number },
  point2: { x: number; y: number },
) {
  return Math.sqrt((point1.x - point2.x) ** 2 + (point1.y - point2.y) ** 2);
}

describe.skipIf(!hasModelFamily)('service locate with deep think', () => {
  test('service locate with search area', locateTestOptions, async () => {
    const { context } = await getContextFromFixture('taobao');

    const service = new Service(context);
    const { element } = await service.locate(
      {
        prompt: '购物车 icon',
        deepLocate: true,
      },
      {},
      modelRuntime(),
    );
    expect(element).toBeDefined();

    await sleep(3000);
  });

  test(
    'service locate with search area - deep think',
    locateTestOptions,
    async () => {
      const { context } = await getContextFromFixture('taobao');

      const service = new Service(context);
      const { element, rect } = await service.locate(
        {
          prompt: '顶部购物车 icon',
          deepLocate: true,
        },
        {},
        modelRuntime(),
      );
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
    },
  );
});

test.skip('service locate with search area', async () => {
  const { context } = await getContextFromFixture('image-only');

  const service = new Service(context);
  const { element, rect } = await service.locate(
    {
      prompt: '-',
      deepLocate: true,
    },
    {},
    modelRuntime(),
  );
  console.log(element, rect);
  await sleep(3000);
});

describe(
  'service describe',
  {
    timeout: 2 * 60 * 1000,
  },
  () => {
    test('service describe - by rect', async () => {
      const { context } = await getContextFromFixture('taobao');
      const service = new Service(context);
      const { description } = await service.describe(
        {
          left: 580,
          top: 140,
          width: 80,
          height: 30,
        },
        modelRuntime(),
      );

      expect(description).toBeDefined();
    });

    test('service describe - by center point', async () => {
      const { context } = await getContextFromFixture('taobao');
      const service = new Service(context);
      const { description } = await service.describe(
        [580, 140],
        modelRuntime(),
      );

      expect(description).toBeDefined();
    });
  },
);
