---
title: Web Test Pattern
impact: CRITICAL
tags: pattern, web, playwright, browser, lifecycle
---

# Web Test Pattern

Uses `WebTest` from `src/context`. Each `fixture.create()` opens a new browser page on a shared Chromium instance.

- `ctx.agent` = `PlaywrightAgent` — AI methods (`aiTap`, `aiInput`, `aiAssert`, `aiQuery`, `aiWaitFor`, `aiAct`)
- `ctx.page` = Playwright `Page` — native browser APIs (`waitForLoadState`, `goto`, `title`, etc.)

## Lifecycle

```typescript
const fixture = WebTest.init(options?);  // beforeAll + afterEach + afterAll registered automatically

it('scenario', async (testCtx) => {
  const ctx = await fixture.create('https://example.com', testCtx);  // per-test context
  // ... test body ...
});
```

Under the hood, `init()` registers these hooks:

| Hook | What happens |
|------|-------------|
| `beforeAll` | Launch shared Chromium browser |
| each `it` | `fixture.create()` opens a new page, creates fresh `PlaywrightAgent` |
| `afterEach` | Collect test report, close page |
| `afterAll` | Merge reports + close browser |

## Scaffolding Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { WebTest } from '../../src/context';

describe('<FEATURE_NAME>', () => {
  const fixture = WebTest.init();

  it('<SCENARIO_1>', async (testCtx) => {
    const ctx = await fixture.create('<TARGET_URL>', testCtx);

    // Step 1: interact
    await ctx.agent.aiAct('<describe the interaction>');

    // Step 2: wait for result
    await ctx.page.waitForLoadState('networkidle');

    // Step 3: verify
    await ctx.agent.aiAssert('<expected state>');
  });

  it('<SCENARIO_2>', async (testCtx) => {
    const ctx = await fixture.create('<TARGET_URL>', testCtx);
    // ...
  });
});
```

## Setup Options

```typescript
const fixture = WebTest.init({
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
- Use `fixture.create(targetUrl, testCtx, { headless: false })` to override headless per test
- `ctx.page` supports all standard Playwright Page APIs — see [playwright-api.md](../apis/playwright-api.md)
