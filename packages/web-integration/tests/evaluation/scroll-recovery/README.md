# Scroll recovery evaluation

Compare recovery disabled (`0`) with the native-only default candidate (`default`, option omitted). Both arms use the same execution-feedback implementation. Explicit intervals `2` and `3` remain available for opt-in visual fallback comparisons.

| Suite | Cases | Track | Outcome |
| --- | --- | --- | --- |
| `routine` | Sign-in, preferences, cancel dialog, search, receipts, load more, exact-count moving/boundary scrolls | natural | Correct page outcome, no wrong selection; exact-scroll tasks also enforce count, distance and stop behavior |
| `repository` | Existing narrow input, disabled/read-only form, native select, popup-interrupted login | natural | Exact values and login state; prohibited button clicks fail |
| `boundary` | Invoice matrix, shipment board, expense ledger, release timeline | controlled or natural | Correct target clicked with no wrong selections |

These are 16 local layouts, not independent production workloads. Controlled runs inject the same three downward 200-pixel plans into both arms through the real Agent loop, then resume real model planning. This measures recovery after an induced stall, not natural failure frequency. Routine and repository suites reject controlled injection. Model-free fixture tests separately verify the outcome checkers.

## Run

Configure model credentials in the repository `.env` (loaded with override), and optionally `PUPPETEER_EXECUTABLE_PATH`. Controlled injection requires the `openai-chat` client seam; this is a runner constraint, not a restriction on the production API.

Build before running, and keep the build unchanged throughout the comparison:

```sh
pnpm exec nx build @midscene/web
pnpm --filter @midscene/core sync-report-template
pnpm exec nx test:evaluation @midscene/web
pnpm exec node --test packages/web-integration/tests/evaluation/scroll-recovery/{boundary-fixtures,routine-fixtures,repository-fixtures}.test.mjs
EVAL_SUITE=routine EVAL_REPETITIONS=5 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
EVAL_SUITE=repository EVAL_REPETITIONS=3 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
EVAL_SUITE=boundary EVAL_TRACK=controlled EVAL_REPETITIONS=3 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/summary.mjs <run-directory> [other-run-directory]
```

The manual `scroll-recovery-evaluation.yml` workflow uses the shared AI CI action and uploads every attempt. Choose natural track for routine/repository, controlled track for boundary confirmation.

## Configuration and evidence

- `EVAL_SUITE`: `routine` (default), `repository`, or `boundary`.
- `EVAL_TRACK`: `natural` (default) or `controlled` (boundary only).
- `EVAL_ARMS`: default `0,default`; `EVAL_REPETITIONS`: default 1; `EVAL_WORKERS`: default 3. Arm order rotates reproducibly; it is not fully randomized.
- `EVAL_CASES`: optional comma-separated case IDs; `EVAL_PREFIX_SCROLLS`: controlled prefix length, default 3.
- `EVAL_RUN_ID`: fresh output directory name. Existing directories are rejected. `MIDSCENE_RUN_DIR` selects the artifact root.

Each attempt gets a fresh browser context and Agent, cache disabled, 14-action / 180-second budgets. Success requires normal API completion, the page goal and instruction compliance. Retain every failure, timeout and service error in the denominator; never replace failures with successful retries.

Results live under `midscene_run/test-results/scroll-recovery-evaluation/`. Manifests capture HEAD, tracked patch/hash, rendered fixture hashes, model, viewport and budgets. Attempts retain fixture HTML, action screenshots, report HTML, model usage and native review evidence. SIGINT/SIGTERM retain interruption records; the summarizer rejects incomplete runs and duplicate IDs. Freeze source and build before a run; repeated layouts measure variability, not new independent cases.

Historical observer-only, private screenshot replay and exploratory regression tools are available at commit `89ec2335f`. Existing archived results retain their original source version. Current fixture checks and the Agent runner are the maintained reproduction path. Neither these synthetic results nor fixed-output replay establish a one-percentage-point non-inferiority margin or original Chrome-extension/site acceptance.
