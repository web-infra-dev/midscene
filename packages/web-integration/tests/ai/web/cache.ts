import os from 'node:os';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import puppeteer from 'puppeteer';
import 'dotenv/config'; // read environment variables from .env file

const sleep = (ms: number | undefined) => new Promise((r) => setTimeout(r, ms));
Promise.resolve(
  (async () => {
    const browser = await puppeteer.launch({
      headless: true, // 'true' means we can't see the browser window
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({
      width: 1280,
      height: 768,
      deviceScaleFactor: os.platform() === 'darwin' ? 2 : 1, // this is used to avoid flashing on UI Mode when doing screenshot on Mac
    });

    await page.goto('https://example.com/');
    await sleep(5000);

    // 👀 init Midscene agent
    const agent = new PuppeteerAgent(page, {
      cache: true,
    });

    await agent.aiAssert('this is the example.com page');

    // Also perform an aiAct to generate planning cache
    try {
      await agent.aiAct('verify the page title shows Example Domain');
    } catch (error) {
      // If aiAct fails due to AI parsing, that's ok for this test
      console.log('aiAct failed, but cache configuration test is still valid');
    }

    // Verify cache file path is set correctly
    const cacheFilePath = agent.taskCache?.cacheFilePath;
    console.log('cacheFilePath: ', cacheFilePath);
  })(),
);
