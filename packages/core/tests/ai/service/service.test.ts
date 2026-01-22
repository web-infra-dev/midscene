import { distance } from '@/ai-model/prompt/util';
import Service from '@/service';
import { sleep } from '@/utils';
import { globalModelConfigManager } from '@midscene/shared/env';
import { getContextFromFixture } from 'tests/evaluation';
import { beforeAll, describe, expect, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 120 * 1000,
});

const modelConfig = globalModelConfigManager.getModelConfig('insight');

describe.skipIf(!modelConfig.modelFamily)(
  'service locate with deep think',
  () => {
    test('service locate with search area', async () => {
      const { context } = await getContextFromFixture('taobao');

      const service = new Service(context);
      const { element } = await service.locate(
        {
          prompt: '购物车 icon',
          deepThink: true,
        },
        {},
        modelConfig,
      );
      expect(element).toBeDefined();

      await sleep(3000);
    }, 300000); // 5 minutes timeout

    test('service locate with search area - deep think', async () => {
      const { context } = await getContextFromFixture('taobao');

      const service = new Service(context);
      const { element, rect } = await service.locate(
        {
          prompt: '顶部购物车 icon',
          deepThink: true,
        },
        {},
        modelConfig,
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
    }, 300000); // 5 minutes timeout
  },
);

test.skip('service locate with search area', async () => {
  const { context } = await getContextFromFixture('image-only');

  const service = new Service(context);
  const { element, rect } = await service.locate(
    {
      prompt: '-',
      deepThink: true,
    },
    {},
    modelConfig,
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
        modelConfig,
      );

      expect(description).toBeDefined();
    });

    test('service describe - by center point', async () => {
      const { context } = await getContextFromFixture('taobao');
      const service = new Service(context);
      const { description } = await service.describe([580, 140], modelConfig);

      expect(description).toBeDefined();
    });
  },
);
