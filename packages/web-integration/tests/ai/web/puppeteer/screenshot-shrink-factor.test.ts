import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { sleep } from '@midscene/core/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

const pageContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Test Page</title>
  <style>
    #button {
      margin:200px;
    }
  </style>
</head>
<body>
  <button id="button">foo</button>
  <script>
    const button = document.getElementById('button');
    button.addEventListener('click', () => {
      button.textContent = 'bar';
    });
  </script>
</body>
</html>
`;

describe('screenshotShrinkFactor', () => {
  it('no-shrink', async () => {
    const { originPage, reset } = await launchPage('about:blank', {
      viewport: {
        height: 800,
        width: 600,
        deviceScaleFactor: 2,
      },
    });
    await originPage.setContent(pageContent);

    const agent = new PuppeteerAgent(originPage, {});

    await agent.aiTap('button foo');

    await agent.aiAssert('the button text is "bar"');

    await reset();
  });

  it('shrink-2', async () => {
    const { originPage, reset } = await launchPage('about:blank', {
      viewport: {
        height: 800,
        width: 600,
        deviceScaleFactor: 2,
      },
    });
    await originPage.setContent(pageContent);

    const agent = new PuppeteerAgent(originPage, {
      screenshotShrinkFactor: 2,
    });

    await agent.aiTap('button foo');

    await agent.aiAssert('the button text is "bar"');

    await reset();
  });
});
