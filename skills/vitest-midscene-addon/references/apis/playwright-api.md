---
title: Playwright Page API
impact: MEDIUM
tags: playwright, page, browser, navigation, network
---

# Playwright Page API (Web Only)

`ctx.page` is a standard Playwright `Page` object, available only in `WebTestContext`. Use it for native browser operations that complement Midscene's AI methods.

> **Note:** Android and iOS tests do NOT have `ctx.page`. Use `ctx.agent` methods only.

## Commonly Used in This Project

```typescript
await ctx.page.waitForLoadState('networkidle');  // wait for network to settle
await ctx.page.goto('https://example.com');      // navigate to URL
const title = await ctx.page.title();            // get page title
const url = ctx.page.url();                      // get current URL
await ctx.page.waitForTimeout(1000);             // explicit delay (avoid if possible)
await ctx.page.waitForSelector('.loaded');        // wait for a CSS selector
await ctx.page.screenshot({ path: 'shot.png' }); // take a screenshot
```

## How to Look Up More

1. Official docs: https://playwright.dev/docs/api/class-page
2. In `node_modules/playwright-core`, find the `Page` type definition, read the signatures first
3. If types are not enough, follow the source references to read the implementation
