# @midscene/replay

Deterministic Web steps for Midscene Agents and Native Test YAML. Test owns setup, cancellation, Case retries and the integrated HTML report; Replay supplies strict locators, optional locator fallback, program assertions and Jev visual checks.

## Install

```sh
pnpm add @midscene/replay @midscene/test @midscene/web playwright
pnpm exec playwright install chromium
```

Use matching versions of the Midscene packages. Configure Native Test with your existing Playwright/Puppeteer Agent setup and `createMidsceneNodes` from `@midscene/test/midscene`. Replay reuses that Agent; it does not launch or own a browser.

## Attach a script to a YAML node

```yaml
cases:
  - name: Save a draft
    steps:
      - aiAct:
          prompt: Save the draft and check its receipt
          replay:
            script: ./steps/save.mjs
            params: { label: Saved }
```

`steps/save.mjs`:

```js
import { defineStep } from '@midscene/replay';

export default defineStep({
  async ready(rp) {
    await rp.expect({ xpath: '//button[@id="save"]' }, { visible: true });
  },
  async run(rp) {
    await rp.tap('Save', { candidates: [{ xpath: '//button[@id="save"]' }] });
  },
  async done(rp, { params }) {
    await rp.expect({ xpath: '//output' }, { text: params.label });
  },
});
```

```sh
pnpm exec midscene-test case.yaml --replay=strict
```

| Mode | Behavior |
| --- | --- |
| `auto` (default) | Try the script; on script failure call the original ai* with its original input/options on the current page |
| `strict` | Script failure fails the node; declared locator fallback is disabled |
| `off` | Ignore scripts and use the original ai*, including its normal cache |

Set a project default with `test: { replay: 'strict' }`. The CLI overrides it; SDK users can pass `replay` to `runTestProject` from `@midscene/test/config`.

Scripts receive `input`, `params`, `signal` and the host `agent`. Return the original native method's raw result: for example, aiQuery data or `{ pass, thought }` for aiAssert. A returned assertion failure or invalid result fails the node without AI fallback, including in auto mode. Cancellation and terminal resource errors also do not fall back. Auto fallback and native Case retries can repeat actions already applied by a script.

## Runtime API and boundaries

Use `withReplay(agent)` for direct SDK calls or `runReplayStep(agent, step, options)` for ready/run/done execution. Actions include `tap`, `input`, `keyPress`, `select` and `scroll`; checks include `expect`, `waitFor` and `verify`. `read` evaluates a read-only page expression without adding action evidence. Collect execution events through `onEvent`.

Strict locators must resolve one visible target. Optional identity-guard or AI-location fallback must be explicitly declared; strict mode disables both. Popup following is scoped to the action's source page and validates the destination.

`verify` uses Jev from the host Agent's insight configuration, or a dedicated Jev model with its default OpenRouter credentials. It keeps pass, fail, pending and inconclusive distinct and does not substitute a general model. Prepared model-input screenshots and errors remain in the native report. Screenshots may be sent to the configured model provider, and reports are not redacted.

Strict helpers currently support Web main documents, not iframe/Shadow DOM targets, native dialogs, mobile or desktop. Jev can check visible Canvas output but does not provide Canvas interaction.
