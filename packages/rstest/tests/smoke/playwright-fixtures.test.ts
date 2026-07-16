/**
 * Runtime smoke test for the Playwright provider's fixture wiring on top of
 * `@rstest/playwright` — no AI model involved. Run via `test:smoke`; excluded
 * from the default unit-test include glob because it launches a real browser.
 */
import { test as base, expect } from '../../src/index';

const PAGE_URL = 'data:text/html,<title>midscene-smoke</title><h1>hi</h1>';

// `SMOKE_BROWSER_CHANNEL=chrome` runs against a system-installed Chrome for
// machines without the playwright-managed chromium download.
const midsceneOptions = {
  headless: true,
  ...(process.env.SMOKE_BROWSER_CHANNEL
    ? { launchOptions: { channel: process.env.SMOKE_BROWSER_CHANNEL } }
    : {}),
};

const test = base.extend({ url: PAGE_URL, midsceneOptions });
const testWithoutUrl = base.extend({ midsceneOptions });

test('page fixture auto-navigates to url', async ({ page }) => {
  expect(page.url()).toBe(PAGE_URL);
  expect(await page.title()).toBe('midscene-smoke');
});

test('context and browser fixtures come from @rstest/playwright', async ({
  browser,
  context,
  page,
}) => {
  expect(browser.isConnected()).toBe(true);
  expect(context.pages()).toContain(page);
});

testWithoutUrl('empty url skips navigation', async ({ page }) => {
  expect(page.url()).toBe('about:blank');
});
