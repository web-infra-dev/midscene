import { PuppeteerWebPage } from '@/puppeteer/page';
import puppeteer, { type Browser } from 'puppeteer';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

/**
 * Regression test for dropped characters when typing in `replace` mode.
 *
 *  - `typeText` (replace mode) calls `clearInput`, then immediately
 *    `keyboard.type`.
 *  - `clearInput` fires a synthetic `input` event with `value === ''`.
 *  - Controlled components in many frameworks re-render in response, and
 *    that re-render can replace the input element. If the replacement
 *    lands AFTER `clearInput` returns but DURING `keyboard.type`, the
 *    first characters land on the now-detached element and are lost.
 *
 * The fix lives in `createWebInputPrimitives` (web-page.ts): after
 * `clearInput`, it waits for the DOM to be quiet via
 * `page.waitForDomQuiet()` before starting `keyboard.type`.
 */

let browser: Browser;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}, 30000);

afterAll(async () => {
  await browser?.close();
});

// Simulates a controlled component that replaces the input element ~250ms
// after the clear-triggered `input` event — past the end of clearInput
// (~150-200ms on Mac puppeteer) and squarely inside `keyboard.type`'s
// per-character loop. The new element is re-focused, mirroring frameworks
// that restore focus after remount.
const RACE_PAGE_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="padding: 24px;">
      <div id="wrapper">
        <input id="i" type="text" value="initial" autofocus
               style="width: 320px; padding: 10px; font-size: 16px;" />
      </div>
      <script>
        let scheduled = false;
        function attach(input) {
          input.addEventListener('input', () => {
            if (scheduled || input.value !== '') return;
            scheduled = true;
            setTimeout(() => {
              const fresh = document.createElement('input');
              fresh.id = 'i';
              fresh.type = 'text';
              fresh.style.cssText = input.style.cssText;
              input.parentNode.replaceChild(fresh, input);
              fresh.focus();
              attach(fresh);
            }, 250);
          });
        }
        attach(document.getElementById('i'));
      </script>
    </body>
  </html>
`;

const inputCenter = async (page: any) =>
  page.$eval('#i', (el: HTMLInputElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

describe('clearInput → keyboard.type race (replace mode)', () => {
  test('raw clearInput + keyboard.type drops characters when the input is replaced mid-type', async () => {
    const page = await browser.newPage();
    await page.setContent(RACE_PAGE_HTML);

    const webPage = new PuppeteerWebPage(page);
    const { x, y } = await inputCenter(page);

    // The low-level path: no waitForDomQuiet between clear and type.
    await webPage.mouse.click(x, y);
    await webPage.clearInput({ center: [x, y] } as any);
    await webPage.keyboard.type('Hello');

    const finalValue = await page.$eval(
      '#i',
      (el) => (el as HTMLInputElement).value,
    );
    await page.close();

    // Demonstrates the underlying race: at least one character is lost.
    expect(finalValue).not.toBe('Hello');
    expect(finalValue.length).toBeLessThan('Hello'.length);
  }, 20000);

  test('Input action (replace mode) preserves all characters via waitForDomQuiet', async () => {
    const page = await browser.newPage();
    await page.setContent(RACE_PAGE_HTML);

    const webPage = new PuppeteerWebPage(page);
    const { x, y } = await inputCenter(page);

    await webPage.mouse.click(x, y);
    // Drive the production typeText path that includes the
    // post-clearInput DOM-quiet wait.
    const actions = webPage.actionSpace();
    const inputAction = actions.find((a) => a.name === 'Input');
    expect(inputAction).toBeDefined();
    await inputAction!.call(
      { value: 'Hello', locate: { center: [x, y] } } as any,
      {} as any,
    );

    const finalValue = await page.$eval(
      '#i',
      (el) => (el as HTMLInputElement).value,
    );
    await page.close();

    expect(finalValue).toBe('Hello');
  }, 20000);
});
