import { sleep } from '@midscene/core/utils';
import { test } from './fixture';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto(
    'https://exp-picture.cdn.bcebos.com/ef4c24ceaad7726b77cb0750bf0f64781523b980.jpg',
  );
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

test('test open new tab', async ({
  page,
  ai,
  aiAssert,
  aiQuery,
  aiBoolean,
}) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(200 * 1000);
  }

  const positiveCheck = await aiBoolean({
    text: '请根据参考图片判断当前页面是不是抖音登录页',
    images: {
      抖音登录页:
        'https://exp-picture.cdn.bcebos.com/125ed0ecd3d96975df0e8c2ed243040149fe0961.jpg',
      微信登录页:
        'https://exp-picture.cdn.bcebos.com/a965c6e9ccd2bb662f2955f59b2a04e23fa2c6c5.jpg',
    },
  });

  expect(positiveCheck).toBe(true);

  const negativeCheck = await aiBoolean({
    text: '请根据参考图片判断当前页面是不是微信登录页',
    images: {
      抖音登录页:
        'https://exp-picture.cdn.bcebos.com/125ed0ecd3d96975df0e8c2ed243040149fe0961.jpg',
      微信登录页:
        'https://exp-picture.cdn.bcebos.com/a965c6e9ccd2bb662f2955f59b2a04e23fa2c6c5.jpg',
    },
  });

  expect(negativeCheck).toBe(false);
});
