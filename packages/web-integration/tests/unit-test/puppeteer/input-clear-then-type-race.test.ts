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
 * `page.waitForDomQuiet({ target })` before starting `keyboard.type`.
 */

const KEYBOARD_TYPE_DELAY_MS = 300;
const REPLACE_AFTER_CLEAR_MS = 450;
const PUPPETEER_TEST_TIMEOUT_MS = 120000;

let browser: Browser;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}, PUPPETEER_TEST_TIMEOUT_MS);

afterAll(async () => {
  await browser?.close();
}, PUPPETEER_TEST_TIMEOUT_MS);

// Simulates a controlled component that replaces the input element shortly
// after the clear-triggered `input` event. The test uses an explicit
// per-character keyboard delay so the replacement lands inside the raw
// `keyboard.type` loop instead of depending on host/browser timing.
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
        window.__midsceneRaceReplacementCount = 0;
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
              window.__midsceneRaceReplacementCount += 1;
            }, ${REPLACE_AFTER_CLEAR_MS});
          });
        }
        attach(document.getElementById('i'));
      </script>
    </body>
  </html>
`;

const SCOPED_WAIT_PAGE_HTML = `
  <!DOCTYPE html>
  <html>
    <body style="padding: 24px;">
      <form id="target-root">
        <input id="i" type="text" value="initial"
               style="width: 320px; padding: 10px; font-size: 16px;" />
      </form>
      <div id="ticker"></div>
      <script>
        let count = 0;
        setInterval(() => {
          document.getElementById('ticker').textContent = String(count++);
        }, 25);
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
  test(
    'Input action (replace mode) preserves all characters via waitForDomQuiet',
    async () => {
      const page = await browser.newPage();
      await page.setContent(RACE_PAGE_HTML);

      const webPage = new PuppeteerWebPage(page, {
        keyboardTypeDelay: KEYBOARD_TYPE_DELAY_MS,
      });
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
      await page.waitForFunction(
        () => (window as any).__midsceneRaceReplacementCount > 0,
      );

      const finalValue = await page.$eval(
        '#i',
        (el) => (el as HTMLInputElement).value,
      );
      await page.close();

      expect(finalValue).toBe('Hello');
    },
    PUPPETEER_TEST_TIMEOUT_MS,
  );

  test(
    'waitForDomQuiet scopes observation to the target ancestor',
    async () => {
      const page = await browser.newPage();
      await page.setContent(SCOPED_WAIT_PAGE_HTML);

      const webPage = new PuppeteerWebPage(page);
      const { x, y } = await inputCenter(page);
      await page.evaluate(() => {
        setTimeout(() => {
          document
            .getElementById('target-root')
            ?.setAttribute('data-ready', 'true');
        }, 20);
      });

      const startedAt = Date.now();
      await webPage.waitForDomQuiet({
        quietMs: 80,
        timeoutMs: 500,
        target: { center: [x, y] } as any,
      });
      const elapsedMs = Date.now() - startedAt;
      await page.close();

      expect(elapsedMs).toBeLessThan(350);
    },
    PUPPETEER_TEST_TIMEOUT_MS,
  );
});
