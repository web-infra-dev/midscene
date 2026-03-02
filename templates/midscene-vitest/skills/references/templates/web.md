---
title: Web Test Template
impact: CRITICAL
tags: template, web, playwright, browser
---

# Web Test Template

Uses `WebTestContext` from `src/context`. Each `create()` opens a new browser page on a shared Chromium instance.

- `ctx.agent` = `PlaywrightAgent` — AI methods (`aiTap`, `aiInput`, `aiAssert`, `aiQuery`, `aiWaitFor`, `aiAct`)
- `ctx.page` = Playwright `Page` — native browser APIs (`waitForLoadState`, `goto`, `title`, etc.)

## Scaffolding Template

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { WebTestContext } from '../../src/context';

describe('<FEATURE_NAME>', () => {
  let ctx: WebTestContext;

  beforeAll(() => WebTestContext.setup());
  afterEach((testCtx) => WebTestContext.collectReport(ctx, testCtx));
  afterAll((suite) => WebTestContext.mergeAndTeardown(suite, '<FEATURE_NAME>'));

  it('<SCENARIO_1>', async (testCtx) => {
    ctx = await WebTestContext.create('<TARGET_URL>', testCtx);

    // Step 1: interact
    await ctx.agent.aiAct('<describe the interaction>');

    // Step 2: wait for result
    await ctx.page.waitForLoadState('networkidle');

    // Step 3: verify
    await ctx.agent.aiAssert('<expected state>');
  });

  it('<SCENARIO_2>', async (testCtx) => {
    ctx = await WebTestContext.create('<TARGET_URL>', testCtx);
    // ...
  });
});
```

## Setup Options

```typescript
WebTestContext.setup({
  headless: false,                         // show browser window (for debugging)
  viewport: { width: 1280, height: 720 }, // custom viewport
  agentOptions: {                          // passed to PlaywrightAgent
    aiActionContext: 'You are a Web UI testing expert.',
    waitAfterAction: 500,
  },
});
```

## Web-Specific Tips

- Use `ctx.page.waitForLoadState('networkidle')` after navigation or form submission before asserting
- Use `WebTestContext.create(targetUrl, testCtx, { headless: false })` to override headless per test
- `ctx.page` supports all standard Playwright Page APIs — see [playwright-api.md](../apis/playwright-api.md)
