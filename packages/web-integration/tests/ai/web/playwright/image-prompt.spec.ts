import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { expect } from '@playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://github.com/web-infra-dev/midscene');
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

test('prompting with images', async ({
  aiBoolean,
  aiAction,
  aiAssert,
  aiTap,
}) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(200 * 1000);
  }

  const positiveCheck = await aiBoolean({
    prompt: 'Please determine whether there is logo1 on the page.',
    images: [
      {
        name: 'logo1',
        url: 'https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png',
      },
    ],
    convertHttpImage2Base64: true,
  });

  expect(positiveCheck).toBe(true);

  const negativeCheck = await aiBoolean({
    prompt: 'Please determine whether there is no logo1 on the page.',
    images: [
      {
        name: 'logo1',
        url: path.resolve(__dirname, '__fixtures__/github-logo.png'),
      },
    ],
  });

  expect(negativeCheck).toBe(false);

  await aiAssert({
    prompt: 'Please determine whether there is logo1 on the page.',
    images: [
      {
        name: 'logo1',
        url: path.resolve(__dirname, '__fixtures__/github-logo.png'),
      },
    ],
  });

  await aiTap({
    prompt: 'The logo1',
    images: [
      {
        name: 'logo1',
        url: path.resolve(__dirname, '__fixtures__/github-logo.png'),
      },
    ],
  });

  await sleep(2000);

  // After click the left top github logo, page will jump to github home
  await aiAssert('The is no text "midscene" in current page.');
});
