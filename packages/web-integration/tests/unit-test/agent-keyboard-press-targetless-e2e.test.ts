import { PlaywrightAgent } from '@/playwright/page-agent';
import { PuppeteerAgent } from '@/puppeteer/page-agent';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { type Browser as PlaywrightBrowser, chromium } from 'playwright';
import puppeteer, { type Browser as PuppeteerBrowser } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const TEST_TIMEOUT_MS = 120_000;
const MODEL_CONFIG = {
  [MIDSCENE_MODEL_NAME]: 'targetless-keyboard-test',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://model.invalid/v1',
  [MIDSCENE_MODEL_FAMILY]: 'qwen2.5-vl' as const,
};
const INPUT_HTML = `
  <!doctype html>
  <html>
    <body>
      <input id="first" value="selected text" />
      <input id="second" value="untouched text" />
    </body>
  </html>
`;

describe('targetless aiKeyboardPress end to end', () => {
  describe('Puppeteer', () => {
    let browser: PuppeteerBrowser;

    beforeAll(async () => {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, TEST_TIMEOUT_MS);

    test('presses a key on the currently focused element', async () => {
      const page = await browser.newPage();
      const agent = new PuppeteerAgent(page, {
        generateReport: false,
        modelConfig: MODEL_CONFIG,
      });
      try {
        await page.setContent(INPUT_HTML);
        await page.$eval('#first', (element) => {
          const input = element as HTMLInputElement;
          input.focus();
          input.select();
        });

        await agent.aiKeyboardPress(undefined, { keyName: 'Backspace' });

        await expect(
          page.evaluate(() => ({
            activeElementId: document.activeElement?.id,
            firstValue: (document.querySelector('#first') as HTMLInputElement)
              .value,
            secondValue: (document.querySelector('#second') as HTMLInputElement)
              .value,
          })),
        ).resolves.toEqual({
          activeElementId: 'first',
          firstValue: '',
          secondValue: 'untouched text',
        });
      } finally {
        await agent.destroy();
        await page.close();
      }
    });
  });

  describe('Playwright', () => {
    let browser: PlaywrightBrowser;

    beforeAll(async () => {
      browser = await chromium.launch({
        headless: true,
        executablePath: puppeteer.executablePath(),
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
      await browser?.close();
    }, TEST_TIMEOUT_MS);

    test('presses a key on the currently focused element', async () => {
      const page = await browser.newPage();
      const agent = new PlaywrightAgent(page, {
        generateReport: false,
        modelConfig: MODEL_CONFIG,
      });
      try {
        await page.setContent(INPUT_HTML);
        await page.locator('#first').focus();
        await page.locator('#first').selectText();

        await agent.aiKeyboardPress(undefined, { keyName: 'Backspace' });

        await expect(
          page.evaluate(() => ({
            activeElementId: document.activeElement?.id,
            firstValue: (document.querySelector('#first') as HTMLInputElement)
              .value,
            secondValue: (document.querySelector('#second') as HTMLInputElement)
              .value,
          })),
        ).resolves.toEqual({
          activeElementId: 'first',
          firstValue: '',
          secondValue: 'untouched text',
        });
      } finally {
        await agent.destroy();
        await page.close();
      }
    });
  });
});
