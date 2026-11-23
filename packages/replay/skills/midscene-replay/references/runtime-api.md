# Runtime API

A replay is a folder. `index.mjs` exports a flow; each business step is a module under `steps/`.

```js
// replay/index.mjs
import { defineReplay } from '@midscene/replay/experimental';
import search from './steps/search.mjs';
import openSite from './steps/open-site.mjs';

export default defineReplay({
  meta: { platform: 'web', startUrl: 'https://cn.bing.com/', requires: { popups: true } },
  steps: [search, openSite],
});
```

```js
// replay/steps/search.mjs
import { defineStep } from '@midscene/replay/experimental';

const field = {
  candidates: [{ xpath: '//form//input[@name="q"]' }],
  guard: { tag: 'input', attr: { name: 'q' } },
  fallback: 'guard',
};
const queryText = (params) => params.query ?? 'todomvc';

// 1. 输入并提交搜索词
export default defineStep({
  id: 'search',
  title: '输入并提交搜索词',
  ready: (rp) => rp.waitForUrl({ pathname: '/' }),
  async run(rp, { params }) {
    const query = queryText(params);
    await rp.input('Bing 搜索框', { ...field, value: query });
    await rp.keyPress('在搜索框按 Enter', { candidates: [{ xpath: '//input[@name="q"]' }], keyName: 'Enter' });
    return query;
  },
  done: (rp, { params }) =>
    rp.waitForUrl({ pathname: '/search', search: { q: queryText(params) } }, { timeoutMs: 5000 }),
});
```

A host runs it with `await replay.run(existingAgent, { params })`. The host owns browser lifecycle and model configuration. Programmatic actions need no model; AI fallback and Jev validate their own configuration. Keep recording IDs and local paths out of the folder. Declare `requires.popups` / `requires.minViewport` only when the flow needs them; they are preflighted before the first action.

For CLI runs, optional `meta.ready: {xpath, timeoutMs?}` identifies a visible application landmark. The CLI checks it after verifying the session start and before running from the first step. Starting at a later step uses the custom session and that step’s entry check. Choose something that only appears when the application is usable. Use a custom session’s `verifyStart` for compound checks, including login or backend state.

## Steps

`defineStep({id, title, run, ready?, done?, retry?, maxAttempts?, optional?})`; `defineReplay({meta, steps, options?})` checks shape and unique ids.

- `id`: stable kebab-case identity used by `from`/`until`, `--step`, reports and acceptance. `title`: the acceptance table title.
- `run(rp, ctx)`: the step's actions and assertions. A successful attempt publishes its return value to `ctx.results[id]` once any `done` check passes.
- `ready(rp, ctx)`: entry-state check, run at the start of every attempt. Required when starting after step 1.
- `done(rp, ctx)`: read-only exit-state check after `run`. It can read the current attempt's return value. That value becomes visible to later steps when `done` succeeds. If `run` fails after a Replay dispatch or after accessing the native Agent during `run`, `done` can verify that this attempt completed the whole step. Success records `recovered` and the original error. The recovered step leaves its entry in `ctx.results` unset, so downstream steps should check for results they require. Throw if the expected result is missing.
- `retry`: `before-dispatch` (default) retries only an attempt with zero Replay dispatches and no access to the native Agent. `idempotent` also allows retry after dispatch or native Agent access. `never` runs once. `maxAttempts` defaults to 2 (1 for `never`).
- `optional: true`: a failure is recorded and the flow continues (banners, tips). Required steps stop the flow.
- `ctx`: `{agent, params, state, results, step: {number, id, title, attempt}}`. Accessing `ctx.agent` marks the attempt `dispatchUnknown` because its count only covers Replay calls. Keep page reads and `ready`/`done` callbacks read-only. The same `state` object is shared across attempts and steps. Rebuild temporary state at the start of each attempt or publish shared values after the relevant business check succeeds.

`flow.run(agent, {params?, from?, until?, retry?})` returns an outcome with status and per-step results. Step status is `passed`, `failed`, `skipped` or `not-run`. Each attempt reports status, dispatch count, total `durationMs`, and measured callbacks in `phaseMs` (`ready`, `run`, `done`). Failures also report the original error and its phase. When a recovery check fails, the attempt also records the `done` error as `recoveryError`. A failed required step throws `ReplayStepError` with `.outcome` and `.step`, and `outcome.failedStep` names the failed step. `retry: false` makes every step single-attempt. Every event and checkpoint carries its step and attempt.

For a single-step SDK run, prepare the Agent at the step's entry and pass `{from: id, until: id, params}`. Every invocation starts with empty `ctx.results` and `ctx.state`. Supply host-known inputs the step explicitly reads via `params`. When the step depends on a previous step's output, run from the first required producer or use `trial --step id` to recreate the prefix. Keep diagnostic setup in the host so full playback follows the recorded business steps.

## Options

`defineReplay({..., options: {judge?, timeoutMs?, fallbackTimeoutMs?}})`: optional explicit VerdictJudge, readiness budget (default 5000 ms) and AI-locate budget (default 15000 ms). `withReplay(agent, options)` creates the same `rp` outside a flow, for low-level use and tests.

## Targets

All actions take `{candidates: [{xpath}, ...], within?: {xpath}, guard?, timeoutMs?, fallback?, sideEffect?, postcondition?}`.

- Candidates must agree on one enabled, rendered, hit-testable element inside `within`. Readiness (missing, covered, moving) is retried within the budget; ambiguity fails immediately. Position and identity are rechecked before one ActionSpace dispatch. Native reports record the action; Replay adds no extra screenshot.
- `guard: {tag?, role?, text?, attr?}` is checked against the strict result too (`TARGET_GUARD_MISMATCH`). `text` matches the element's normalized `textContent`. Use `attr` for an exact DOM attribute such as `aria-label`. `role` matches the explicit role or the runtime's implicit role. A recording fingerprint can use a coarser role and a name from a label or placeholder. Verify these values on the replay page before using them as guards.
- `fallback`, `sideEffect` and `postcondition` are described in [fallback](fallback.md). `postcondition` runs after every successful dispatch.

## Actions

- `tap / hover / doubleClick(description, target)`.
- `tap(..., {opensPage: {url} | {match: {origin, pathname}}, timeoutMs?})`: uses a Playwright BrowserAgent or a Puppeteer BrowserAgent supplied by a custom session. Listens before the single click, follows only a page opened by the source page, switches the active page and checks destination URL and DOM readiness before running `postcondition`. A timeout ends the attempt.
- `input(description, {...target, value, inputStrategy?: 'legacy'|'sequential'|'bulk'})`. Bulk is the default choice; use sequential when per-key behavior matters.
- `select(description, {candidates, within?, guard?, option: {value} | {label}, timeoutMs?, postcondition?})`: strict XPath to a native single-choice `<select>`. Supply one exact option value or label. Replay rejects missing, ambiguous or disabled options and multiple-choice controls. It selects once and dispatches bubbling `input` and `change` events in the page. These events have `isTrusted: false`. The action appears in the Agent report. Use the recorded value if stable, and verify the resulting business state. When the trace shows both the keyboard selection and its native select event, replay that selection once. Select supports strict positioning only.
- `scrollIntoView(description, {target, container?, timeoutMs?})`: explicitly reveal a uniquely located element through ActionSpace. `target` is an XPath locator or candidates with an optional scope and guard. `container` is the XPath of the visible scrolling region. Omit it to scroll the page. An already visible target returns immediately. After scrolling, Replay locates the target again and checks it is visible and unobstructed. Use this for rendered targets, and use an explicit `scroll` to reveal content that has yet to mount.
- `keyPress(description, {...target, keyName})`; `scroll(description, {...target, direction, distance})`. Scroll a located container; do not use recorded coordinates. Verify that the intended target is ready, then resolve its XPath and business identity again after scrolling. These two use strict positioning.

## Reads and waits

- `read(fn, {args?})`: read a transient page value, such as a scroll measurement, with a synchronous page function. Pass arguments explicitly. It produces no Replay checkpoint, screenshot or model request. Keep the function read-only.
- `inspect(locatorOrTarget, {within?, timeoutMs?})`: text, value, checked, selected, visibility, attributes. Immediate by default. Reads never use AI.
- `expect(locatorOrTarget, partialState, {timeoutMs?})`: polls until the given fields match; times out with the actual state.
- `waitFor(fn, {args?, timeoutMs?, title?})`: synchronous page function (no Node closures, pass JSON arguments) or legacy expression string. `waitForUrl(urlOrMatch, {timeoutMs?, title?})`: exact URL or `{origin?, pathname?, hash?, search?}`. Name business waits with `title` so the evidence shows what passed or timed out and how long it took. Prefer feedback tied to the current action or entity. For example, look for a new confirmation and an undo entry specifically for the wood craft when stock is capped.
- `checkpoint(title, fn, {args?, expect?, screenshot?})`: records actual page state, deep-compares when `expect` is given, keeps failure evidence.
- `verify(criterion, {settleTimeoutMs?})`: Jev visual verdict. Pass returns; fail/inconclusive throw; only pending retries within an explicit budget. Missing Jev throws; no general-model fallback.

Use `done` to prove the business outcome and `ready` to establish the entry state. For example, assert the applied filter and the PR's canonical path when checking search results, check the filtered list URL when entering the next step, and leave the actionable XPath and its fallback to `tap`. An assertion that requires the same XPath can fail before the action gets a chance to recover it.

## Diagnose visual checks

Write the criterion around visible positive evidence such as a green seal marked PASS or a preview showing its pending-issuance placeholder. For controls, name the entity and intended meaning. Keep verified business identity in the program check.

Use saved screenshots or an isolated HTML fixture to exercise the same `rp.verify` criterion before a trial that writes data. For a saved image, open it in a local fixture page with the expected viewport and use `withReplay(agent).verify(criterion)`. For changing controls, exercise the author’s pre-dispatch condition against variants and a rejection case. Cover real success, the valid precondition, a loading state, and a wrong entity or action as applicable. Record verdicts and evidence as diagnostics. A model call on saved evidence still sends the image to the configured service. Apply the Skill’s risk-notice rule.

## Limits

Web main-document XPath only: no strict iframe/Shadow DOM targeting or native file dialogs. Same-tab navigation is not equivalent to a recorded popup. The scale cache follows interface, document, viewport, DPR, visual viewport and screenshot shrink settings.
