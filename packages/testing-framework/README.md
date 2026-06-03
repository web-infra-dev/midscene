# @midscene/testing-framework

AI-native v2 UI testing framework for natural-language cases (Phase 0).

Write test cases as natural-language flows in YAML; let Midscene's UI Agent drive
the UI and a swappable general-purpose agent (Pi by default) make gating
judgments and free-form analysis.

> This is the Phase 0 implementation of RFC 0001
> (`rfcs/0001-v2-testing-framework-phase0.md`). It covers the node model,
> `midscene.config.ts`, `defineRuntime` / `$name` skills, the verify verdict
> contract, the output contract, and context assembly. Rstest wiring and
> v1→v2 migration are out of scope for this phase.

## Concepts

- **Cases are natural language.** A case YAML has only a `name` and a `flow`;
  the environment/target lives in `midscene.config.ts`.
- **Node model:**
  - `ui` — natural-language UI action, run by Midscene's UI Agent.
  - `verify` — gating judgment; must produce a pass/fail verdict (fail-closed).
  - `soft` — same as verify, but failure only records a warning.
  - `agent` — advisory free exploration; never changes pass/fail.
  - custom nodes — registered via `defineRuntime`, own a whole step.
- **One model endpoint.** `verify`/`soft`/`agent` run on Pi, pointed at the same
  `MIDSCENE_MODEL_BASE_URL` endpoint as the UI Agent (RFC decision C′).
- **Output is the only channel forward.** Each step records a natural-language
  conclusion; later nodes reference it by name. The current screenshot is the
  only image; `state` (engineering-facing) never reaches the agent.

## Quick start

```ts
// midscene.config.ts
import { defineMidsceneConfig } from '@midscene/testing-framework';

export default defineMidsceneConfig({
  uiAgent: { type: 'web', options: { url: 'https://shop.example.com' } },
  testDir: './e2e',
  output: { summary: './midscene_run/output/summary.json' },
  uiAgentOptions: { generateReport: true },
});
```

```yaml
# e2e/checkout.yaml
name: Add to cart
flow:
  - ui: Open the first product
  - verify: The product detail page shows a visible "Add to cart" button
  - agent: Inspect the page for anything that looks off
```

```bash
midscene-tf run            # run all discovered cases
midscene-tf run e2e/x.yaml # run a specific case
```

See a runnable demo in the repository's `example/` directory.

## Programmatic API

```ts
import { runAll, loadConfig } from '@midscene/testing-framework';

const { config } = await loadConfig(process.cwd());
const summary = await runAll(config);
```

## Swapping the agent layer

The `verify`/`soft`/`agent` runtime is swappable. Provide your own
`agentRuntime` (an `AgentRuntimeAdapter`) in `midscene.config.ts` to replace the
default Pi-backed implementation.
