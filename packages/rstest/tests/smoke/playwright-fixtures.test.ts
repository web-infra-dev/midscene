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

const test = base.extend({ playwright });

test("agent binds to the upstream page; navigation is the test's job", async ({
  agent,
  page,
}) => {
  expect(agent).toBeDefined();
  // No auto-navigation: the page starts blank, exactly as upstream.
  expect(page.url()).toBe('about:blank');

  await page.goto(PAGE_URL);
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
