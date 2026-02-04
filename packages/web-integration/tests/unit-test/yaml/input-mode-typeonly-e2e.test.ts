import puppeteer from 'puppeteer';
import { describe, expect, test } from 'vitest';

describe('Input action typeOnly mode - e2e', () => {
  test('typeOnly mode with multiple inputs - simulating user scenario', async () => {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // Create a page with multiple inputs
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body style="padding: 20px;">
          <input id="input1" type="text" style="width: 300px; padding: 10px;" />
          <button id="btn">Button</button>
        </body>
      </html>
    `);

    try {
      // Step 1: Type first value using native Puppeteer
      await page.click('#input1');
      await page.keyboard.type('Hello');

      const valueAfterFirstInput = await page.$eval(
        '#input1',
        (el) => (el as HTMLInputElement).value,
      );
      console.log('Value after first input:', valueAfterFirstInput);
      expect(valueAfterFirstInput).toBe('Hello');

      // Step 2: Click button to change focus
      await page.click('#btn');

      // Step 3: Simulate typeOnly behavior - click input and type without clearing
      await page.click('#input1');
      await page.keyboard.press('End'); // Move cursor to end
      await page.keyboard.type(' World');

      const valueAfterSecondInput = await page.$eval(
        '#input1',
        (el) => (el as HTMLInputElement).value,
      );
      console.log('Value after second input:', valueAfterSecondInput);

      // Content should be appended
      expect(valueAfterSecondInput).toBe('Hello World');
    } finally {
      await browser.close();
    }
  }, 30000);
});
