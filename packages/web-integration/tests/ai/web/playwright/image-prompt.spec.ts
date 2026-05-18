import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sleep } from '@midscene/core/utils';
import { expect } from '@playwright/test';
import { test } from './fixture';

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

test('prompting with images', async ({ page, aiBoolean, aiAssert, aiTap }) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(200 * 1000);
  }

  await page.goto('https://github.com/web-infra-dev/midscene');

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
    prompt: 'Please determine whether there is logo1 on the page.',
    images: [
      {
        name: 'logo1',
        url: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png',
      },
    ],
    convertHttpImage2Base64: true,
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

test('does not treat reference image content as current screenshot content', async ({
  page,
  aiAssert,
  aiBoolean,
}) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(200 * 1000);
  }

  await page.goto('about:blank');

  const negativeCheck = await aiBoolean({
    prompt: 'There is a github logo.',
    images: [
      {
        name: 'github-logo',
        url: path.resolve(__dirname, '__fixtures__/github-logo.png'),
      },
    ],
  });

  expect(negativeCheck).toBe(false);

  await aiAssert({
    prompt: 'There is no github logo.',
    images: [
      {
        name: 'github-logo',
        url: path.resolve(__dirname, '__fixtures__/github-logo.png'),
      },
    ],
  });
});

test('aiAct follows reference image order', async ({ page, aiAct }) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(200 * 1000);
  }

  const fixtureDir = path.resolve(__dirname, '__fixtures__/image-prompt-order');
  const imageA = path.join(fixtureDir, 'image-a.png');
  const imageB = path.join(fixtureDir, 'image-b.png');
  const imageC = path.join(fixtureDir, 'image-c.png');
  const imageD = path.join(fixtureDir, 'image-d.png');

  await page.goto(pathToFileURL(path.join(fixtureDir, 'index.html')).href);

  // Correct click order by fruit: apple, orange, banana, pear.
  await aiAct({
    prompt:
      'Click the four icons on the page in this exact order: Image A, then Image B, then Image C, then Image D.',
    images: [
      {
        name: 'Image A',
        url: imageA,
      },
      {
        name: 'Image B',
        url: imageB,
      },
      {
        name: 'Image C',
        url: imageC,
      },
      {
        name: 'Image D',
        url: imageD,
      },
    ],
  });

  await expect(page.locator('#result')).toHaveText('已经按照预期顺序点击');
  await expect
    .poll(() => page.evaluate(() => (window as any).clickedSlots))
    .toEqual(['slot-3', 'slot-4', 'slot-1', 'slot-2']);
});
