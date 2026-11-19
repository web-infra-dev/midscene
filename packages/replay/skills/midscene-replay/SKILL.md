---
name: midscene-replay
description: Record a Web workflow, generate a step-based Midscene replay, and review actual replay evidence against the original recording. Use for recording, authoring, testing or repairing a replay with a coding Agent.
---

# Midscene Replay

**Goal:** deliver one readable `replay/` folder: `index.mjs` declares the flow, `steps/*.mjs` hold one business step each. A business owner replays it with only that folder: `await replay.run(existingAgent)` in their own host, or `node <CLI> run replay/`. Steps are the unit of replay, retry, resume, testing and review. Recordings, trials and `acceptance.md` are authoring evidence; nobody needs to maintain them.

The CLI is `../../scripts/cli.mjs` relative to this skill. Commands load `.env` from the calling directory or `--env-file FILE`. References: [runtime API](references/runtime-api.md), [fallback](references/fallback.md), [session](references/session.md), [commands and review](references/review.md). Templates: [replay folder](templates/replay/index.mjs), [session](templates/session.mjs), [acceptance](templates/acceptance.md).

## Hard rules

1. Requirements come from the user and the original recording, never from what the replay happens to do. Never weaken them after seeing results.
2. Keep the original recording immutable; generated work stays outside it, temporary diagnostics in `scratch/`.
3. One numbered row of the acceptance table is one `defineStep`, in the same order and with the same title. Split at a verifiable business outcome or an independent recovery boundary. Keep supporting actions with that outcome, such as clicking the logo solely to reach the page needed for the next action. Prove each outcome in `done` or in `run`.
4. Bind every target to business identity (destination URL, test ID, scoped text). Treat recording fingerprints as hints. Verify the actual DOM attribute, text or role before using it in a guard. Never use a result rank or `[1]` to hide ambiguity.
5. Business outcomes are program checks. Use Jev only for genuinely visual judgments. Never manufacture results through DOM/application writes or replace required UI steps with direct navigation.
6. A dispatched action is never silently repeated: choose each step's `retry` from its side effects (`idempotent` only when repeating is harmless).
7. Acceptance needs three consecutive complete runs of the same replay, session and requirements with zero fallbacks. After any change, rerun a full group; focused step runs are diagnostics.
8. Inspect actual images and state for every step of every run. Execution success is not business acceptance; missing evidence stays unverified.
9. Keep failed trials and evidence.
10. Ask the user only for material ambiguity or business-scope changes.
11. Before a run that writes to an external system, show the environment, account, target, affected steps and planned number of writes across all runs. Record the user's confirmation and its scope in `acceptance.md`. Reuse explicit authorization for the same scope. A plan marked **shown** does not authorize writes.

## Workflow

1. **Record.** `node <CLI> record web --url <START_URL> --out <NEW_RECORDING_DIR>` opens a new Chrome window. The user completes the flow (including popups) and presses Enter. For recurring signed-in work, use the [dedicated browser setup](references/session.md): open the Replay window once, let the user sign in, then use its local `--cdp` endpoint for `record`, `run`, and `trial`. If the user specifically asks to use their daily browser, follow the same reference for direct attachment. For a different new browser, pass `--browser msedge` or `--browser chromium`. If you cannot expose the browser, give the command and finish instructions.
2. **Prepare.** `node <CLI> prepare <RECORDING_DIR> --out <NEW_WORKSPACE> [--goal TEXT]`. Read `brief.md` (an index with recorded locators), `events.jsonl` and the actual screenshots.
3. **Show requirements.** Before scripting, display a table in chat and save it in the prefilled `acceptance.md`: steps numbered from 1 with a kebab-case step id, object identity, entry state, expected outcome and checks, plus goal, initial state and known gaps. Mark it **shown** and continue; mark **confirmed** only on explicit user confirmation or correction. If the user asks to approve first, wait. Preserve meaningful input/Enter, revealing hover, filters and same-window/new-window behavior; focus, pointer phases and redirects are evidence, not required units.
4. **Write the steps.** Copy the template folder to `WORKSPACE/replay/`. Per step: `ready` (entry state; needed to start or resume there), `run`, `done` (exit state), `retry`, and `optional` only for genuinely optional UI such as a banner. Verify the business state in `ready`/`done` and let actions resolve their own locators, so an XPath change does not block an intended recovery. Use `rp.select` for a recorded native single-choice dropdown and verify its business effect in `done`. Use `rp.read` for temporary DOM reads and checkpoints for evidence. Pass step data through `ctx.results` or `ctx.state`, parameters through `ctx.params`. State is shared across attempts. Check required results if an upstream step can recover. Comments and titles in the user's language. Add `guard`/`fallback` where the page is likely to change (see [fallback](references/fallback.md)). Use `session.mjs` when built-in setup cannot establish the start state, including [cross-origin authentication and backend reset](references/session.md#custom-session).
5. **Trial.** `node <CLI> trial replay/` (writes `trials/NN`, three runs, headless; `--headed` to watch). On failure, read the failed step's attempts, `steps.md` and `heal.json`. Use the per-attempt `ready`, `run`, and `done` timings before changing a wait. Use `trial replay/ --step <id>` to replay the prefix through the failing step, or use a [prepared step session](references/review.md#run) to run just that step. Then rerun a full group. `--allow-fallback` (one run) checks an opted-in recovery and never counts toward acceptance.
6. **Review.** Start with `trials/NN/steps.md` for the frozen inputs, run reports and step images. Open `run-N/review.png` and the original images as needed. Compare with the recording and requirements. Append per-step, per-run pass/fail/unverified to `acceptance.md`, keeping program execution and Agent review separate; mention any retry or recovered step.
7. **Deliver.** Report the folder, setup, checks, model requests, timings and limitations. Daily use runs the flow once with per-step retries and fallbacks reported. A failed step identifies where to investigate or start a [host-prepared diagnostic run](references/review.md#run).
