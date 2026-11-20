# Commands, evidence and review

```sh
node <CLI> trial WORKSPACE/replay [--session S | --cdp BROWSER] [--runs 3] [--headed] [--out NEW_DIR]
node <CLI> trial WORKSPACE/replay --step STEP [--runs N]          # focus one step; diagnosis only
node <CLI> trial WORKSPACE/replay --runs 1 --allow-fallback       # diagnosis only
node <CLI> run replay [--session S | --cdp BROWSER] [--headed] [--out NEW_DIR] [--from STEP] [--until STEP]
```

## Trial

- `STEP` is a step id or 1-based number. Passing the directory or its `index.mjs` snapshots the same regular files, including helpers and fixtures, regardless of the directory name. `.git` and `node_modules` are excluded. A standalone entry with another name snapshots its entry and `steps/` scripts.
- Keep local ESM file imports inside the replay or session entry's own directory. Trial checks local import specifiers before execution and rejects paths outside that directory or into `node_modules`/`.git`. Installed packages, CommonJS `require()` and files opened directly by the script are host inputs. Keep credentials outside the snapshot.
- Without `--out`, a prepared workspace (with `source.json` beside the folder) writes `trials/01`, `trials/02`, ...; otherwise a new directory under the Midscene run directory.
- `--step` runs earlier steps normally and stops after the focused step. Whole-flow host checks stay `not_checked`, with the reason in each run's report. A passed focused run is diagnostic evidence for the selected range.
- Each run opens a new session, resets and verifies the start, runs the script and checks; the first failure stops the group. Added, removed or edited files within the snapshot scope fail the group. Source integrity is checked before and after; output belongs outside the recording and replay directory.
- `result.json`: `execution: passed|failed`, mode (`strict`, `diagnostic`, `focus`), counts, host configuration, `snapshotScope`, the group `inputDigest` and file hashes, business step identifiers and per-run facts. Exit zero means execution and checks succeeded, not acceptance.
- Per run: `report.json` (the flow outcome with per-step status and attempts, retry count, events, checks, fallbacks, heal hints, timings, start/terminal images and URLs, model requests), `agent.json` (native Midscene dump), `evidence.entries` in the run report with native task status, timestamps and deduplicated paths under `images/`, and `review.png` (last screenshot of each numbered step).
- Group: `steps.md` lists every step per run with status, attempts (phase, dispatch count, error), actions with `resolvedBy`, checkpoints, fallbacks, repair hints and image links. Start here for the input digest, frozen replay, business acceptance in a prepared workspace, native reports and start, terminal or failure screenshots. Retries are allowed in a strict group but must be explained in review; fallbacks fail it. `heal.json` collects recovered and suggested locators.
- `setupMs`, `scriptMs`, `checksMs` separate phases; model request timings are recorded per phase.
- Use `steps.md` or `flow.steps[].attempts[].phaseMs` in each run's `report.json` to find time spent in `ready`, `run`, and `done`. Inspect each attempt separately. A missing phase did not run. Recovery checks are timed under `done`; the error phase still identifies where the attempt first failed. Inspect the slow callback and increase a specific wait only when replay evidence shows an expected transition needs it.

## Run

Executes the flow once (or `--from`/`--until` a step range) and writes `result.json` with the per-step outcome, actions, fallbacks, checkpoints, checks, model requests and the native HTML report path. It separates business completion from report/cleanup failures so a caller does not repeat a completed flow.

The selected range determines `mode` before the session opens, so it remains available if startup or execution fails. If the range omits any steps, `mode` is `partial`. A successful range can report `execution: passed` with `business: not-checked`. The step's own `ready` and `done` still run. Whole-flow session checks stay `not_checked`. A range that covers all steps uses `mode: full` and runs the full-flow checks on successful execution.

To execute only one step, pass the same id to both bounds:

```sh
node <CLI> run WORKSPACE/replay --session STEP_SESSION --from STEP --until STEP
```

Prepare the step's page and test data in the [session](session.md) before its `ready` check. The default host still opens `meta.startUrl`. Skipped steps provide no `ctx.results` or `ctx.state`. If the step needs data produced by earlier steps, use `trial --step STEP` to execute the prefix. Single-step runs are diagnostic; confirm any planned external writes before running them.

## Review

- Use `steps.md` and `review.png` to navigate, then open actual images. Log text and native action status show dispatch, not effect.
- For each requirement and run, record evidence and pass/fail/unverified in `acceptance.md`. A correct final screen alone does not prove the process. Check ordering, target objects, omissions and substitutions.
- Unexecuted, inconclusive and erroneous checks remain unresolved; accepted gaps do not become passes. Significant requirement changes need the user's decision, with earlier evidence preserved.
- Same-Agent review and three passes do not prove completeness or broad stability. Reports contain business inputs and screenshots; keep them with the recording's access expectations. This workflow is not a sandbox against a malicious local script.
