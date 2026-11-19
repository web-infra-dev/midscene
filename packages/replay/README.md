# Midscene Replay

[简体中文](./README.zh.md)

Record a Web workflow, then use your current coding Agent and the bundled [Skill](./skills/midscene-replay/SKILL.md) to generate and review a `replay/` folder for an existing Midscene Agent: `index.mjs` declares the flow and each business step is its own `defineStep` module. Steps are the unit of replay, retry, resume, testing and review. Ordinary replay needs the compatible SDK and Replay runtime, without the coding Agent, recording attachments or a workbench.

## Record and prepare

Run from the repository root with workspace dependencies installed. Use fresh directories:

```sh
pnpm exec nx build @midscene/replay
node packages/replay/scripts/cli.mjs record web --url https://cn.bing.com/ --out midscene_run/replay/my-recording
# Complete the workflow in Chrome, then press Enter.
node packages/replay/scripts/cli.mjs prepare midscene_run/replay/my-recording --out midscene_run/replay/my-authoring
```

`prepare` creates a source manifest and index, links existing host/tool dependencies into the new authoring directory and verifies imports. It prints the Skill path without launching another coding Agent or installing/changing host dependencies. `--goal TEXT` is optional. Commands load the calling directory's `.env` or `--env-file FILE`; credentials stay in the host. `--version` prints the Midscene SDK package version.

Recording defaults to a new Chrome window with an isolated profile. Use `--browser msedge` or `--browser chromium` for another new window. On macOS, use `node packages/replay/scripts/cli.mjs browser msedge` (or `browser chrome`) to open a dedicated browser with a persistent profile. Sign in manually the first time, then pass `--cdp http://127.0.0.1:9222` to `record web`, `run`, or `trial`. The dedicated window preserves the signed-in profile. A CDP trial copies cookies for the start URL and same-origin `localStorage` into each fresh context. Use a custom session for additional origins, other auth state or a backend data reset. [Session setup](./skills/midscene-replay/references/session.md)

The Agent reads original evidence, displays a business-flow/acceptance table numbered from 1 in the chat and saves it in `acceptance.md`. It records the plan as shown and continues by default; explicit user confirmation or corrections are recorded as confirmed for that scope. If the user asks to approve first, it waits for their answer. Each table row becomes one step with a stable id, entry check (`ready`), actions (`run`), exit check (`done`) and retry policy. Group supporting actions with the step whose business result they establish. Split when an action has its own verifiable outcome or recovery boundary. Clarify material ambiguity or scope changes. Original evidence stays immutable and requirements are not weakened to fit a failed replay.

## Execute and review

```sh
node packages/replay/scripts/cli.mjs trial midscene_run/replay/my-authoring/replay
```

A replay with `meta.startUrl` uses the default headless Chromium host; add `--headed` to watch. Supply `--session FILE` for login, fixture reset or a special context. Without `--out`, trials go to `trials/01`, `trials/02`, ... inside the prepared workspace; put diagnostics in its `scratch/` directory. Repair one step with `trial replay --step <id>`: earlier steps run normally and the run stops after that step; it is diagnostic only. Trial opens/resets a fresh session, verifies its start, executes the script and configured checks, and saves native reports, start/end screenshots, code snapshots and timing metrics. It defaults to three runs and stops after a failure. Final acceptance requires at least three consecutive complete passes of the same version, plus business evidence review; `--runs 1` is diagnostic only. Restart the group after changes. It finds `source.json` beside the replay folder, or accepts `--source MANIFEST`, to protect original evidence. There is no low-level event matching or automatic certificate.

Start a trial review in `steps.md`. It links to the input digest in `result.json`, frozen scripts, business acceptance, each run’s report and images, and locator repair hints when available. The machine-readable screenshot index is `evidence.entries` in each run’s `report.json`. Native `agent.json`, deduplicated images and `review.png` remain available. The coding Agent compares original requirements with all three runs' images, checkpoint state and executed script, then appends conclusions to `acceptance.md`. Execution success alone is not business acceptance. Missing evidence remains unverified.

Use ordinary JS assertions for important intermediate/final state, and optional `session.checks` for independent final reads. Record key state/screenshots with `rp.checkpoint`. Use `rp.verify` for visual requirements that need Jev. The script declares when this check is needed.

## Deliver and run

```sh
node packages/replay/scripts/cli.mjs run midscene_run/replay/my-authoring/replay
```

`run` outputs one structured result and a native HTML report path. If the local HTML report template is missing, build `@midscene/report` following the repository contribution guide. For a separate project, provide compatible workspace/local builds of Replay, Web and Playwright; Replay is private.

For one-step diagnosis, use `run REPLAY --session STEP_SESSION --from STEP --until STEP` with a custom session that prepares that step's page and data. Skipped steps provide no results or shared state. Use `trial REPLAY --step STEP` when you need earlier steps to produce those values. Find per-attempt `ready`, `run`, and `done` timings in the JSON outcome and the trial's `steps.md`. [Diagnostic commands and evidence](./skills/midscene-replay/references/review.md#run)

```js
import replay from './replay/index.mjs';
const outcome = await replay.run(existingAgent, { params });
```

The host owns setup and teardown. Each step runs `ready → run → done`. A step retries only when its attempt dispatched nothing and never accessed the native Agent (`before-dispatch`, default) or when it is declared `idempotent`; a failed `run` with evidence of dispatch can recover if `done` verifies the complete step outcome; `optional` steps never stop the flow. A failed required step throws `ReplayStepError` with the per-step outcome. Use `run(agent, {from, until})` to select a range after the host prepares the entry state. Steps receive `rp`, which supplies strict XPath actions, inspection, condition waits and Jev. Readiness waits at most 5 seconds by default and returns immediately when ready; increase a local budget only with evidence. Ambiguity fails immediately; dispatched actions are not silently retried. Ordinary bulk input and cached coordinate scale avoid unnecessary overhead.

For a native single-choice dropdown, use `rp.select("Sort by price", { candidates, option: { value: "price-asc" } })` with the control’s XPath. Verify the resulting list order in `done`. Pointer and keyboard actions use the existing ActionSpace. [Runtime API](./skills/midscene-replay/references/runtime-api.md)

Supported actions can opt in to locator fallback so scripts survive page changes: `fallback: 'guard'` re-finds the unique element matching an identity guard without a model; `fallback: 'locate'` adds one bounded AI locate, constrained by scope and guard and proven by a required postcondition. Fallback only happens before dispatch. Formal trials disable it and report repair hints instead; daily runs allow it and report every recovery. The host can disable it with `MIDSCENE_REPLAY_FALLBACK=off`. Programmatic actions need no model configuration; AI/Jev calls still require theirs. For a recorded popup, use a Playwright or Puppeteer BrowserAgent and `rp.tap(description, {candidates, opensPage: {url: 'https://example.com/'}})`: it listens before clicking, follows the source page's popup, switches and verifies the exact URL plus DOM readiness. It never repeats the click or defaults to load/networkidle waits. Daily invocation executes once with the script's checks. Report actual timings; no fixed speed or screenshot-count acceptance gate applies.

Playwright Web-to-Web is verified with a local recording-to-trial fixture. Puppeteer replay through a custom session is verified on the public TodoMVC demo and in a local popup regression. Recording and the default Replay host use Playwright. [Puppeteer session setup](./skills/midscene-replay/references/session.md#puppeteer-replay-host)

Historical case reports describe their own script, runtime and session. When a flow writes to an external system, confirm its environment, account, target, steps and planned write count across runs before execution. Strict iframe/Shadow DOM targeting and native file dialogs remain unsupported; mobile adapters need further implementation and validation. Source evidence and business checks support Agent review but do not prove completeness or isolate malicious scripts. See the [runtime API](./skills/midscene-replay/references/runtime-api.md) and [fallback](./skills/midscene-replay/references/fallback.md) references.

## Development

```sh
pnpm exec nx build @midscene/replay
pnpm exec nx test @midscene/replay
pnpm --filter @midscene/replay lint
```

The private experimental package ships CLI, Skill and `@midscene/replay/experimental` / `@midscene/replay/tooling`. Tests cover recording, native dispatch, business-check failures, evidence preservation and Jev results. Real-site acceptance is separately reviewed; model calls require host credentials.

`replay-v1.0.0` is the Replay baseline tag. Earlier V6/V7 labels identify development snapshots. The `source.json` and recording `trace.json` format versions are `6` and `1`, respectively. CLI `--version` prints the Midscene SDK package version.
