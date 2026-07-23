# @midscene/rstest

Run Midscene AI browser agents as [Rstest](https://rstest.rs/) tests. Built on [`@rstest/playwright`](https://www.npmjs.com/package/@rstest/playwright) — inheriting its debug mode, trace capture, and Playwright-flavored `expect` — plus an Rstest reporter that surfaces Midscene reports.

```ts
import { expect, test } from '@midscene/rstest/playwright';

test('adds a todo', async ({ agent, page }) => {
  await page.goto('http://localhost:5173/');
  await agent.aiAct("type 'Study AI' in the input and press Enter");
  await agent.aiAssert('the list contains exactly one item: "Study AI"');
});
```

The browser engine is explicit in the import path, mirroring `@midscene/web`'s
`/playwright` and `/puppeteer` entries. Playwright is the only engine supported
today.

## Install

```bash
npm install @midscene/web @midscene/rstest @rstest/core @rstest/playwright playwright --save-dev
```

Requires `@rstest/core >= 0.11.2`, `playwright >= 1.49.1`, and Node.js
`^20.19.0 || >=22.12.0`.

## Configure

Register `MidsceneReporter` in `rstest.config.ts`. After a test file finishes it
merges the reports of all tests in that file into one HTML report and prints the
path to the console.

```ts
import MidsceneReporter from '@midscene/rstest/reporter';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: ['e2e/**/*.test.ts'],
  // AI calls take time, so leave plenty of headroom for tests and hooks.
  testTimeout: 1_800_000,
  hookTimeout: 60_000,
  reporters: ['default', new MidsceneReporter()],
});
```

Midscene reaches the model through environment variables — set
`MIDSCENE_MODEL_BASE_URL`, `MIDSCENE_MODEL_API_KEY`, and `MIDSCENE_MODEL_NAME`
before running. See [Model configuration](https://midscenejs.com/model-config.html).

## Fixtures

| Fixture | Description |
| --- | --- |
| `agent` | The Midscene agent for the current page. |
| `page` / `context` / `browser` | The Playwright objects behind the agent. |
| `request` / `serve` | From `@rstest/playwright`. |
| `agentForPage(page, opts?)` | An agent for another page; its steps land in the same report. |
| `playwright` | Browser options: launch, context, debug, trace. |
| `agentOptions` | Agent options: cache, action context, and more. |

`agent` and `agentForPage` cannot be overridden via `test.extend` — a
replacement would lose report collection. Depend on them from your own fixtures
instead.

## Docs

- **Integration guide**: <https://rstest.rs/guide/advanced/midscene>
- **Agent API**: <https://midscenejs.com/api.html#interaction-methods>
- **Runnable example**: [`demo/`](./demo)
