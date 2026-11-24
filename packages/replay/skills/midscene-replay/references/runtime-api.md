# Native ai* script implementations

```yaml
cases:
  - name: Approve B
    steps:
      - aiAct:
          prompt: Approve order B and verify its receipt
          replay:
            script: ./steps/approve.mjs
            params: { orderId: B }
```

```js
import { defineStep } from '@midscene/replay';
export default defineStep({
  async ready(rp, ctx) { /* Check business entrance. */ },

  async run(rp, { input, params, agent, signal }) {
    // Use the original prompt/value/options from input and extra implementation params.
    // Perform real UI operations; return the original native method's raw value.
  },

  async done(rp, ctx) { /* Prove the business outcome. */ },
});
```

Test resolves scripts relative to the YAML file after existing project/environment interpolation. Native Test currently has no generic prior-node-output interpolation; keep native result objects unchanged. No id/title/retry/maxAttempts/optional fields, no ctx.state/results. `run` output is published only after done succeeds. Errors go to native ai* in auto; strict fails; off ignores the script. Native cancellation and resource terminal errors do not fall back. Test owns retry and continue-on-error. The signal reaches Replay phases, dispatch, waits, Jev and locate; arbitrary user JS must cooperate.

Native result contracts: aiAct returns string/undefined; aiQuery returns raw data (Node output `{data: raw}`); aiBoolean/Number/String/Ask return their native scalar (`{data:{value}}`); aiAssert returns `{pass:boolean, thought?, message?}`, with false handled by the native assertion conversion; aiLocate returns the native locate result. Preserve original inputs/options and business meaning. Unsupported shared entry points reject replay explicitly.

`runReplayStep(agent, definition, {input?, params?, signal?, strict?, onEvent?})` executes one implementation attempt; it is not a standalone flow runner. `withReplay(agent, {signal?, judge?, timeoutMs?, fallbackTimeoutMs?})` exposes the same helpers. `strict` disables guard/locate; explicit Jev is still available. Plain waits are immediate unless a budget is given; action readiness defaults to 5000 ms. aiWaitFor supplies its native timeout and checkIntervalMs to default rp.waitFor / rp.waitForUrl waits. Custom loops must honor input.options and ctx.signal.

## Targets

All actions take `{candidates: [{xpath}, ...], within?: {xpath}, guard?, timeoutMs?, fallback?, sideEffect?, postcondition?}`.

- Candidates must agree on one enabled, rendered, hit-testable element inside `within`. Readiness (missing, covered, moving) is retried within the budget; ambiguity fails immediately. Position and identity are rechecked before one ActionSpace dispatch. Native reports record the action; Replay adds no extra screenshot.
- `guard: {tag?, role?, text?, attr?}` is checked against the strict result too (`TARGET_GUARD_MISMATCH`). `text` matches the element's normalized `textContent`. Use `attr` for an exact DOM attribute such as `aria-label`. `role` matches the explicit role or the runtime's implicit role. A recording fingerprint can use a coarser role and a name from a label or placeholder. Verify these values on the replay page before using them as guards.
- `fallback`, `sideEffect` and `postcondition` are described in [fallback](fallback.md). `postcondition` runs after every successful dispatch.

## Actions

- `tap / hover / doubleClick(description, target)`.
- `tap(..., {opensPage: {url} | {match: {origin, pathname}}, timeoutMs?})`: uses a Playwright BrowserAgent or a Puppeteer BrowserAgent supplied by native Test setup. Listens before the single click, follows only a page opened by the source page, switches the active page and checks destination URL and DOM readiness before running `postcondition`. A timeout ends the attempt.
- `input(description, {...target, value, inputStrategy?: 'legacy'|'sequential'|'bulk'})`. Bulk is the default choice; use sequential when per-key behavior matters.
- `select(description, {candidates, within?, guard?, option: {value} | {label}, timeoutMs?, postcondition?})`: strict XPath to a native single-choice `<select>`. Supply one exact option value or label. Replay rejects missing, ambiguous or disabled options and multiple-choice controls. It selects once and dispatches bubbling `input` and `change` events in the page. These events have `isTrusted: false`. The action appears in the Agent report. Use the recorded value if stable, and verify the resulting business state. When the trace shows both the keyboard selection and its native select event, replay that selection once. Select supports strict positioning only.
- `scrollIntoView(description, {target, container?, timeoutMs?})`: explicitly reveal a uniquely located element through ActionSpace. `target` is an XPath locator or candidates with an optional scope and guard. `container` is the XPath of the visible scrolling region. Omit it to scroll the page. An already visible target returns immediately. After scrolling, Replay locates the target again and checks it is visible and unobstructed. Use this for rendered targets, and use an explicit `scroll` to reveal content that has yet to mount.
- `keyPress(description, {...target, keyName})`; `scroll(description, {...target, direction, distance})`. Scroll a located container; do not use recorded coordinates. Verify that the intended target is ready, then resolve its XPath and business identity again after scrolling. These two use strict positioning.

## Reads and waits

- `read(fn, {args?})`: read a transient page value, such as a scroll measurement, with a synchronous page function. Pass arguments explicitly. It produces no Replay checkpoint, screenshot or model request. Keep the function read-only.
- `inspect(locatorOrTarget, {within?, timeoutMs?})`: text, value, checked, selected, visibility, attributes. Immediate by default. Reads never use AI.
- `expect(locatorOrTarget, partialState, {timeoutMs?})`: polls until the given fields match; times out with the actual state.
- `waitFor(fn, {args?, timeoutMs?, checkIntervalMs?, title?})`: synchronous page function (no Node closures, pass JSON arguments) or legacy expression string. `waitForUrl(urlOrMatch, {timeoutMs?, title?})`: exact URL or `{origin?, pathname?, hash?, search?}`. Name business waits with `title` so the evidence shows what passed or timed out and how long it took. Prefer feedback tied to the current action or entity. For example, look for a new confirmation and an undo entry specifically for the wood craft when stock is capped.
- `checkpoint(title, fn, {args?, expect?, screenshot?})`: records actual page state, deep-compares when `expect` is given, keeps failure evidence.
- `verify(criterion, {settleTimeoutMs?})`: Jev visual verdict. Pass returns; fail/inconclusive throw; only pending retries within an explicit budget. Missing Jev throws; no general-model fallback.

Use `done` to prove the business outcome and `ready` to establish the entry state. For example, assert the applied filter and the PR's canonical path when checking search results, check the filtered list URL when entering the next step, and leave the actionable XPath and its fallback to `tap`. An assertion that requires the same XPath can fail before the action gets a chance to recover it.

## Diagnose visual checks

Write the criterion around visible positive evidence such as a green seal marked PASS or a preview showing its pending-issuance placeholder. For controls, name the entity and intended meaning. Keep verified business identity in the program check.

Use saved screenshots or an isolated HTML fixture to exercise the same `rp.verify` criterion before a trial that writes data. For a saved image, open it in a local fixture page with the expected viewport and use `withReplay(agent).verify(criterion)`. For changing controls, exercise the author’s pre-dispatch condition against variants and a rejection case. Cover real success, the valid precondition, a loading state, and a wrong entity or action as applicable. Record verdicts and evidence as diagnostics. A model call on saved evidence still sends the image to the configured service. Apply the Skill’s risk-notice rule.

## Limits

Web main-document XPath only: no strict iframe/Shadow DOM targeting or native file dialogs. Same-tab navigation is not equivalent to a recorded popup. The scale cache follows interface, document, viewport, DPR, visual viewport and screenshot shrink settings.
