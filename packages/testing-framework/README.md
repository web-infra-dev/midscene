# @midscene/testing-framework

Runtime for Midscene's AI-native UI Testing Framework. It turns a
`midscene.config.ts` plus natural-language YAML cases into an Rstest run.

See the [UI Testing Framework](https://midscenejs.com/ui-testing-framework)
guide for the full topic.

## Usage

Define a project config:

```ts
// midscene.config.ts
import { defineMidsceneConfig } from '@midscene/testing-framework';

export default defineMidsceneConfig({
  target: { type: 'web', options: { url: 'http://127.0.0.1:3000' } },
  testDir: './e2e',
  include: ['**/*.yaml'],
  testRunner: { maxConcurrency: 1, bail: 0, testTimeout: 120_000 },
  output: { summary: './midscene_run/output/summary.json' },
  agentOptions: { cache: true },
});
```

Run the suite from a thin entry:

```ts
// run-suite.ts
import { runMidsceneSuite } from '@midscene/testing-framework';

await runMidsceneSuite();
```

## What it provides

- `defineMidsceneConfig` — type-only config helper that returns the config
  unchanged.
- `runMidsceneSuite` — loads `midscene.config.ts`, discovers cases, and runs
  them through Rstest.
- Default `web` (PlaywrightAgent) and `android` (`agentFromAdbDevice`) targets,
  or a fully custom `setup`.
- Custom `yamlSteps` that interleave with built-in Midscene YAML steps.

`@rstest/core` is a peer dependency; install it in your test project.
