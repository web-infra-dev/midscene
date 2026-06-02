# @midscene/testing-framework

Runtime for Midscene's AI-native UI Testing Framework. It turns a
`midscene.config.ts` plus natural-language YAML cases into an Rstest run.

See the [UI Testing Framework](https://midscenejs.com/ui-testing-framework)
guide for the full topic.

Midscene is a thin testing framework built on top of Rstest: Rstest is the
underlying engine, and everyday users interact through a `midscene.config.ts`
plus natural-language YAML cases instead of touching Rstest directly.

## Usage

Define a project config and write YAML cases under `testDir`:

```ts
// midscene.config.ts
import { defineMidsceneConfig } from '@midscene/testing-framework';

export default defineMidsceneConfig({
  target: { type: 'web', options: { url: 'http://127.0.0.1:3000' } },
  testDir: './e2e',
  include: ['**/*.yaml', '**/*.test.ts'],
  testRunner: { maxConcurrency: 1, bail: 0, testTimeout: 120_000 },
  output: { summary: './midscene_run/output/summary.json' },
  agentOptions: { cache: true },
});
```

```yaml
# e2e/search.yaml
flow:
  - aiAct: Search for "running shoes"
  - aiAssert: The product detail page shows a visible Add to cart button
```

### Mode A — run in-process

Run the suite with one command. The framework discovers the cases and drives
Rstest internally; the runner never imports your config (the Rstest worker
does), so a Playwright-importing config never collides with Rstest's bundled
`@vitest/expect`.

```bash
midscene-testing-framework test            # or: --config ./midscene.config.ts
```

Or programmatically:

```ts
import { runMidsceneTest } from '@midscene/testing-framework';

await runMidsceneTest();
```

Mode A drives the discovered YAML cases (run sequentially against one shared
agent) and honors `testRunner.testTimeout` / `retry` per case and
`testRunner.bail` (after that many case failures, the rest fail fast without
running). `maxConcurrency` has no effect in Mode A (one shared agent ⇒
sequential); it and native `.test.ts` files only apply in the emitted Mode B
project, where Rstest's own `include` and config control them.

### Mode B — emit a native Rstest project

Export a standalone Rstest project (`rstest.config.ts` + `e2e/*.test.ts` +
`package.json`) and run it with the native `rstest` command:

```bash
midscene-testing-framework emit ./out-project
cd ./out-project && npm install && npx rstest run
```

## What it provides

- `defineMidsceneConfig` — type-only config helper that returns the config
  unchanged.
- `runMidsceneTest` — Mode A in-process runner (config-path only; discovery and
  setup happen inside the Rstest worker).
- `emitRstestProject` — Mode B exporter that writes a native Rstest project.
- `registerMidsceneSuite` / `defineMidsceneCaseTest` — runtime entries used by
  the generated bootstrap module and emitted `e2e/*.test.ts` files.
- Default `web` (PlaywrightAgent) and `android` (`agentFromAdbDevice`) targets,
  or a fully custom `setup`.
- Custom `yamlSteps` that interleave with built-in Midscene YAML steps.

`@rstest/core` is a peer dependency; install it in your test project (or in the
project emitted by `midscene emit`).
