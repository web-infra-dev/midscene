import puppeteer from 'puppeteer';
import { describe, expect, it } from 'vitest';

describe.skipIf(process.platform !== 'darwin')(
  'Puppeteer macOS input clearing',
  () => {
    it('Meta+A Backspace does not reliably clear focused input content', async () => {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();

      try {
        await page.setContent(`
          <!doctype html>
          <html>
            <body>
              <input id="test-input" type="text" value="hello" />
            </body>
          </html>
        `);

        const input = await page.$('#test-input');
        if (!input) {
          throw new Error('test input not found');
        }

        await input.click();
        await page.keyboard.down('Meta');
        await page.keyboard.press('a');
        await page.keyboard.up('Meta');
        await page.keyboard.press('Backspace');

        const valueAfterKeyboardClear = await page.$eval(
          '#test-input',
          (element) => (element as HTMLInputElement).value,
        );

        expect(valueAfterKeyboardClear).not.toBe('');

        await page.$eval('#test-input', (element) => {
          (element as HTMLInputElement).value = 'hello';
        });

        await input.click({ count: 3 });
        await page.keyboard.press('Backspace');

        const valueAfterTripleClickClear = await page.$eval(
          '#test-input',
          (element) => (element as HTMLInputElement).value,
        );

        expect(valueAfterTripleClickClear).toBe('');
      } finally {
        await browser.close();
      }
    });
  },
);
