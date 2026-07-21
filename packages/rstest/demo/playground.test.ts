import {
  test as base,
  defaultPlaywrightOptions,
  describe,
  expect,
} from '@midscene/rstest/playwright';

const PAGE_URL =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/contacts3.html';

// Navigation is the test's own job, exactly as in Midscene's Playwright
// integration. For a whole file on one URL, override the `page` fixture in
// one place — plain `@rstest/playwright` fixture composition.
//
// Browser-level config goes on `@rstest/playwright`'s own `playwright`
// fixture; overriding it replaces the package defaults wholesale, so spread
// `defaultPlaywrightOptions` to keep them. `DEMO_BROWSER_CHANNEL=chrome` runs
// against a system-installed Chrome instead of the Playwright-managed
// Chromium (useful when the browser download is unavailable).
const test = base.extend({
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto(PAGE_URL);
    await use(page);
    await page.close();
  },
  ...(process.env.DEMO_BROWSER_CHANNEL
    ? {
        playwright: {
          ...defaultPlaywrightOptions,
          launchOptions: {
            ...defaultPlaywrightOptions.launchOptions,
            channel: process.env.DEMO_BROWSER_CHANNEL,
          },
        },
      }
    : {}),
});

describe('Contacts page', () => {
  // Pattern: semantic UI check via `aiAssert`.
  test('renders the smart contacts header and grid', async ({ agent }) => {
    await agent.aiAssert(
      'the page header reads "Smart Contacts" with a grid of contact cards below it, each card showing an avatar, name, position, and contact details',
    );
  });

  // Pattern: structured data extraction via `aiQuery<T>` + deterministic
  // comparison via rstest `expect`.
  test('lists every contact with the expected fields', async ({ agent }) => {
    const contacts = await agent.aiQuery<
      { name: string; position: string; email: string }[]
    >(
      'Array<{name: string, position: string, email: string}>, the name (heading), position (line under the name) and email address shown on every contact card',
    );

    expect(contacts).toHaveLength(5);
    const byName = Object.fromEntries(contacts.map((c) => [c.name, c]));
    expect(byName['Alice Johnson']).toEqual({
      name: 'Alice Johnson',
      position: 'Senior Software Engineer',
      email: 'alice.johnson@techcorp.com',
    });
  });

  // Pattern: AI interaction (`aiRightClick`) + AI synchronization (`aiWaitFor`)
  // + AI extraction (`aiQuery`) chained together.
  test('opens the custom context menu on right-click', async ({ agent }) => {
    await agent.aiRightClick("Alice Johnson's contact card");
    await agent.aiWaitFor(
      'a context menu is visible with the items "Call Contact", "Send Email", "Send Message", "Edit Contact", "Copy Info" and "Delete Contact"',
      { timeoutMs: 10_000 },
    );

    const items = await agent.aiQuery<string[]>(
      'string[], the visible text of every item inside the open context menu, in order',
    );
    expect(items).toEqual([
      'Call Contact',
      'Send Email',
      'Send Message',
      'Edit Contact',
      'Copy Info',
      'Delete Contact',
    ]);
  });

  // Escape hatch: raw Playwright `Page` for browser-primitive checks that
  // don't need the AI. The `page` override above already navigated it.
  test('inspects raw page state via the Playwright page escape hatch', async ({
    page,
  }) => {
    expect(page.url()).toBe(PAGE_URL);

    const viewport = page.viewportSize();
    expect(viewport?.width).toBeGreaterThan(0);
    expect(viewport?.height).toBeGreaterThan(0);

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  // Multi-session: open a second isolated browser context (think "another
  // user") and drive it with a separate midscene agent via `agentForPage`.
  // The secondary's report is merged alongside the primary's at fixture
  // teardown; destroy is automatic.
  test('drives a second isolated session via browser + agentForPage', async ({
    browser,
    agentForPage,
  }) => {
    const sessionB = await browser.newContext();
    const pageB = await sessionB.newPage();
    await pageB.goto(PAGE_URL);

    const agentB = await agentForPage(pageB);
    await agentB.aiAssert(
      'the contact grid is visible and contains "Alice Johnson"',
    );
  });
});
