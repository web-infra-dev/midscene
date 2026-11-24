# Midscene Replay

Replay adds optional script implementations to native Midscene Test `ai*` nodes. A coding Agent explores a site or reads a manual recording, writes YAML and small `.mjs` steps, tests them, and reviews three complete runs against the intended business outcomes.

Deliver `case.yaml`, `steps/*.mjs`, and a native Test config. Test owns setup, the Agent, hooks, cancellation, Case retries, outputs and the HTML report. Replay provides recording, strict XPath actions, optional guard/AI location, program assertions and Jev visual checks.

## Install and start

Use matching builds of `@midscene/test`, `@midscene/replay` and `@midscene/web` containing the YAML integration. Older Beta packages do not understand this contract.

```sh
pnpm add @midscene/replay @midscene/test @midscene/web playwright
pnpm exec playwright install chromium
```

For repository development: `pnpm exec nx build @midscene/replay` and `pnpm exec nx build @midscene/test`.

Ask your coding Agent: “Use `node_modules/@midscene/replay/skills/midscene-replay/SKILL.md` to record and optimize my workflow at <URL>. Show the numbered business steps and acceptance plan, then continue authoring and verifying.” In this repository, the skill lives at `packages/replay/skills/midscene-replay/SKILL.md`.

See the bundled [project template](skills/midscene-replay/templates/midscene.config.mjs) and [YAML template](skills/midscene-replay/templates/case.yaml). Configure a known start state/reset before acceptance.

```yaml
cases:
  - name: Approve B
    steps:
      - aiAct:
          prompt: Approve order B and verify the receipt
          replay:
            script: ./steps/approve.mjs
            params: { orderId: B }
```

```js
import { defineStep } from '@midscene/replay';
export default defineStep({
  async ready(rp, ctx) { /* Check the business entrance. */ },

  async run(rp, { input, params, signal }) {
    // Perform UI operations using rp.* and the original input/options.
    // Return the original native method's raw result.
  },

  async done(rp, ctx) { /* Verify the business outcome. */ },
});
```

## Execute, prepare and verify

```sh
pnpm exec midscene-test case.yaml --replay=auto
pnpm exec midscene-replay prepare-step case.yaml --case "Approve B" --step 1
pnpm exec midscene-replay verify case.yaml --case "Approve B" --runs 3
```

| Mode | Behavior |
| --- | --- |
| `auto` (default) | Try the script; on failure invoke the original ai* with its original input/options on the current page |
| `strict` | Script failure fails the node; declared locator fallback is also disabled |
| `off` | Ignore scripts and use the original ai*, including its normal cache |

Set the project default with `test: { replay: 'auto' }`; CLI overrides it. SDK users call `runTestProject({configPath, replay})` from `@midscene/test/config`. Script output passes through the original node conversion: aiQuery data, scalar insight values and aiAssert failure retain their native meanings. Cancellation and native terminal resource errors do not fall back. There is no zero-dispatch guarantee: auto or native Case retry can repeat an already-applied action.

`prepare-step` runs setup/hooks and the actual prefix, then holds the active browser and variables before the selected node. It prints the exact CDP endpoint and target ID. Add `--record --out NEW_RECORDING` for manual capture. Enter ends the handoff and releases resources; the native report records an intentional stop, not a passed Case.

`verify` snapshots the authored project, runs native Test in strict mode with retry 0, and retains native HTML/machine results, Replay diagnostics, `steps.md`, `review.png` and optional `heal.json`. A source change or any failed round invalidates the group. A coding Agent still reviews actual screenshots against the original goal. See [verification boundaries](skills/midscene-replay/references/review.md).

## Recording and login

```sh
pnpm exec midscene-replay record web --url https://example.com --out ./recording-new
pnpm exec midscene-replay prepare ./recording-new --out ./authoring-new
```

Recording defaults to a new Chrome window. `--browser msedge|chromium` chooses another browser. Tell the Agent when login is needed: it opens a persistent dedicated Chrome/Edge window and asks you to log in there. Recording can then attach using `--cdp`. Native Test's optional `webFileSetup` supports fresh, `cdp-state` and `cdp-tab` modes; custom Playwright/Puppeteer setups remain supported. See [session setup](skills/midscene-replay/references/session.md).

Recordings/reports are unmasked and may contain private data. The skill prominently warns without interrupting routine work, and requests authorization for real external writes. AI/Jev may send screenshots to the configured service.

## Scope and breaking changes

Strict helpers currently support Web main documents. They do not cover strict iframe/Shadow DOM targets, native dialogs, mobile or desktop. Jev can verify visible Canvas output; it does not provide Canvas interaction. The dedicated browser launcher is macOS-only.

This design removes `/experimental`, `defineReplay`, flow-level retry/recovery/state, `session.mjs`, and standalone `run/trial/report` commands. No compatibility layer is provided. `defineStep/runReplayStep/withReplay` are exported from the package root. Adapt old artifacts to native Test YAML/config and regenerate verification evidence.
