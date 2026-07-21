/**
 * Runtime smoke test for the Playwright provider's fixture wiring on top of
 * `@rstest/playwright` — no AI model involved (the agent is constructed but
 * never performs an AI call). Run via `test:smoke`; excluded from the default
 * unit-test include glob because it launches a real browser.
 */
import {
  test as base,
  defaultPlaywrightOptions,
  expect,
} from '../../src/playwright';

const PAGE_URL = 'data:text/html,<title>midscene-smoke</title><h1>hi</h1>';

// `SMOKE_BROWSER_CHANNEL=chrome` runs against a system-installed Chrome for
// machines without the playwright-managed chromium download. Overriding the
// `playwright` fixture replaces the package defaults wholesale, so spread
// `defaultPlaywrightOptions` to keep them.
const playwright = {
  ...defaultPlaywrightOptions,
  launchOptions: {
    ...defaultPlaywrightOptions.launchOptions,
    headless: true,
    ...(process.env.SMOKE_BROWSER_CHANNEL
      ? { channel: process.env.SMOKE_BROWSER_CHANNEL }
      : {}),
  },
};

const test = base.extend({ url: PAGE_URL, playwright });
const testWithoutUrl = base.extend({ playwright });

test('agent fixture navigates page to url', async ({ agent, page }) => {
  expect(agent).toBeDefined();
  expect(page.url()).toBe(PAGE_URL);
  expect(await page.title()).toBe('midscene-smoke');
});

test('page without agent stays un-navigated (upstream behavior)', async ({
  page,
}) => {
  expect(page.url()).toBe('about:blank');
});

test('context and browser fixtures come from @rstest/playwright', async ({
  browser,
  context,
  page,
}) => {
  expect(browser.isConnected()).toBe(true);
  expect(context.pages()).toContain(page);
});

testWithoutUrl('empty url skips navigation', async ({ agent, page }) => {
  expect(agent).toBeDefined();
  expect(page.url()).toBe('about:blank');
});
