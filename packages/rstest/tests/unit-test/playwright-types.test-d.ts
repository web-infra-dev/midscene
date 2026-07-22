/**
 * Compile-time contract for the public `test` type. This file is not executed
 * by vitest (the include glob only matches `*.test.ts`); `tsc --noEmit` over
 * the tests project verifies it — a no-longer-erroring `@ts-expect-error`
 * fails the typecheck.
 */
import type { PlaywrightAgent } from '@midscene/web/playwright';
import type { Page } from 'playwright';
import { test } from '../../src/playwright';

// ---- Overridable surface: our options fixture and upstream fixtures. ----

test.extend({ agentOptions: { cache: true } });

test.extend<{ page: Page }>({
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },
});

// Chained extends keep the seal and the merged context.
test
  .extend({ agentOptions: { cache: true } })
  .extend<{ label: string }>({ label: 'x' })
  // @ts-expect-error -- `agent` stays sealed after extending
  .extend({ agent: null });

// ---- Sealed keys: deliverables and internal plumbing are rejected. ----

// @ts-expect-error -- `agent` is a deliverable, not an override point
test.extend({ agent: null as unknown as PlaywrightAgent });

// @ts-expect-error -- `agentForPage` is a deliverable, not an override point
test.extend({ agentForPage: null });

// @ts-expect-error -- `__reportMeta` is internal plumbing
test.extend({ __reportMeta: null });

// ---- Destructuring in tests keeps full typing. ----

test('type-only: fixtures are fully typed', async ({
  agent,
  agentForPage,
  page,
}) => {
  const _assert: typeof agent.aiAssert = agent.aiAssert;
  const _agent: Promise<PlaywrightAgent> = agentForPage(page, { cache: true });
  const _title: Promise<string> = page.title();
  void _assert;
  void _agent;
  void _title;
});

// Derived fixtures may consume the deliverables as dependencies.
test.extend<{ adminAgent: PlaywrightAgent }>({
  adminAgent: async ({ browser, agentForPage }, use) => {
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    await use(await agentForPage(adminPage));
    await context.close();
  },
});
