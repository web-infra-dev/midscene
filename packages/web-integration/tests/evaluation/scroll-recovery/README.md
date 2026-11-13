# Scroll recovery evaluation

Status: runnable pilot benchmark. Release gates below remain confirmation criteria, not a claim that the current solution passes them.

The existing six browser checks demonstrate completion with recovery enabled. They do not measure improvement against disabled recovery. The original screenshot pair has been used repeatedly during prompt development and is a development regression case, not a held-out evaluation. The neutral-prompt experiments also showed that passing the browser fixture does not guarantee recovery on that pair.


## Run the benchmark

Build once before starting model runs; do not rebuild shared packages while reports are being generated:

```bash
pnpm exec nx build @midscene/web
pnpm --filter @midscene/core sync-report-template
pnpm exec node --test packages/web-integration/tests/evaluation/scroll-recovery/summary.test.mjs
EVAL_TRACK=oracle pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
EVAL_TRACK=natural EVAL_REPETITIONS=1 EVAL_WORKERS=3 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
EVAL_TRACK=controlled EVAL_REPETITIONS=1 EVAL_WORKERS=3 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/observe.mjs
```

Set `PUPPETEER_EXECUTABLE_PATH` when using an existing Chrome installation. The local runner loads the repository `.env` with override enabled, matching core AI tests. Model/provider configuration and credentials must be configured before running. CI uses the manually dispatched `scroll-recovery-evaluation.yml` workflow and the shared AI CI action.

Each run prints its artifact directory. Summarize completed task runs with:

```bash
pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/summary.mjs <natural-run-directory> <controlled-run-directory>
```

The summarizer rejects incomplete runs and duplicate attempt IDs. SIGINT/SIGTERM stop scheduling new tasks, abort active tasks, and retain an interruption manifest. Interrupted runs are not completed efficacy comparisons. Provider errors recovered by SDK retries are counted in `attemptsWithServiceErrors` separately from terminal `serviceFailures`. All task outcomes, including timeouts and service errors, remain in the primary denominator. Experiment execution finishing is not the same as the algorithm passing release gates.

`EVAL_CASES` selects comma-separated scenario IDs (for example `right-workspace,left-workspace`). `EVAL_RUN_ID` names a fresh artifact directory and refuses to overwrite it. `EVAL_REPETITIONS` defaults to one for a pilot and can be raised to five for confirmation after fixing benchmark defects. The current runner rotates arm order reproducibly; it does not claim fully randomized scheduling.

The initial natural pilot has 28 scenarios × 3 arms = 84 attempts per repetition. Virtual lists and incremental loading add four scenarios (12 further attempts); the container-swap probe adds two more scenarios (six attempts), so the current full natural run has 34 scenarios and 102 attempts per repetition. Controlled injection applies only to eight relevant families (16 scenarios, 48 attempts), not explicit-instruction, reading, or normal-progress tasks. It injects exactly two downward planning responses through the client seam; both are executed by the real Agent loop. Observation and subsequent planning remain real model calls. Two prefix actions let the interval-2 arm react before a third action, while interval-3 still needs another real action. Do not assume all controlled attempts trigger recovery.

Coordinate-specific controlled probes alternate targets, jitter coordinates, or keep the same dispatch point while the page shifts. The injected bbox fixture uses verified 1000-normalized xy bbox encoding for `doubao-seed` and `qwen3`, and fails explicitly for other families. Natural tasks do not receive coordinates or oracle data. A `layout-shift` page moves its container after the first wheel event; `container-swap` covers the same dispatch coordinates with an independently scrollable Notifications panel; `delayed` hides content for 700 ms after scroll. The separate `virtual` fixture mounts only five visible rows and updates them after 350 ms; `loadmore` reveals three records per button press. Reading and load-more tasks grade a code entered from the final record.

Production recovery now retains history. `EVAL_ARMS=0,3` selects disabled and interval-3 arms; the default remains `0,2,3`. The former `EVAL_FEEDBACK_ONLY` seam is rejected explicitly. Reproduce the original projection ablation at revision `52932c425` rather than labeling identical current policies as separate treatments. Its process-cumulative counter caveat remains part of the original report.

Execution evidence now records target identity and offsets on each Scroll when supported. Confirmed directional progress resets the streak. The runner saves these records in `scrollEvidence` alongside observer results, and saves the tracked source diff and its SHA in addition to HEAD. Freeze the build before running; do not change it during a run.

The observer runner saves before/after screenshots and DOM traces. Use `EVAL_EXECUTION_EVIDENCE=1` to include observations from the production browser adapter; the default remains screenshot-only. `EVAL_WORKERS=1` runs it serially. Do not pool these two observer inputs as one treatment. `delayed`, `virtual`, `container-swap`, and `layout-shift` pairs are deliberately unscored because visible movement is ambiguous; their direction fields are not scored either. For nested cases, the oracle measures the target's own scroll offsets separately from ancestor displacement. A moved label from an ancestor-only displacement is a target-scope mismatch, even though pixels visibly move.

`workspace` and `catalog` have different shell layouts but share card construction. The latter is a layout holdout for this pilot, not an independently sourced website or a strong generalization test. No original/private report is committed. All successes and failures must be retained; layout holdouts used to diagnose a fix must be retired before confirmation.

## Private planning replay

`replay.mjs` accepts an external `EVAL_REPLAY_DIR` containing `dump.json`, an after screenshot, and `case.json` with `prompt`, `beforeTaskIndex`, `previousPlanIndex`, `afterImage`, `historyLogs`, and `allowedDirections`. These files are not committed. It compares off and production feedback over five repetitions by default; observer usage is recorded once in `observations.jsonl`. Planning results and errors are retained in `results.jsonl`.

```bash
EVAL_REPLAY_DIR=/path/to/private/fixture EVAL_REPETITIONS=5 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/replay.mjs
```

This replay tests a proposed next action against a known screenshot, not UI execution, threshold triggering, or task completion. It is a development regression because the original screenshot has already informed implementation decisions.

## Questions and comparisons

Compare disabled recovery, interval 2, and interval 3 on identical initial states. Freeze source SHA, fixture SHA, model identifier, adapter/configuration, viewport, action budget and timeout. Randomize arm order within each case/repetition; create a fresh page and Agent, disable cache, and retain every attempt. Do not retry failed attempts into the primary success rate. Report retry results separately.

Use two tracks, with separate results:

- Natural tasks: no injected wrong scrolls or suggested directions. Measures whether recovery improves the user's task overall, including cases where it never triggers.
- Controlled stalls: inject the same recorded erroneous prefix into every arm, then let the actual execution loop continue. Measures recovery conditional on a known stall. Do not call this natural task success or substitute direct observer calls for the execution loop.

The original pilot compared projection against feedback-only. Current production feedback retains history; compare it against disabled recovery and keep historical policy comparisons explicitly labeled by revision.

## Initial case families

| Family | Ground truth and purpose |
| --- | --- |
| Horizontal overflow right | Vertical movement is exhausted; requested target is to the right. |
| Horizontal overflow left | Mirrored case prevents a hard-coded rightward preference. |
| Vertical overflow down | Ordinary long-page progress must not cause an axis switch. |
| Vertical overflow up | Target is above; checks direction symmetry. |
| Nested target, moving outer page | Outer movement must not count as target progress. |
| Moving nested list | Normal inner-container progress must not trigger harmful recovery. |
| Two neighboring containers | Alternating targets must reset the review streak. |
| Locator jitter within one container | Quantify delayed/missed reviews from exact-coordinate comparison. |
| Same coordinate after layout shift | Exposes that coordinates do not establish container identity. |
| Delayed render or virtualized list | Scroll offset can change before rendered content; retain timed samples. |
| Unrelated animation or caret | Pixel change outside the target must not count as target movement. |
| Boundary with no relevant overflow | No invented direction or unrelated clicks; allow a justified stop. |
| Explicit direction and count | Include one/two actions and counts crossing the threshold, e.g. 4/6; never add actions or change axis. |
| Reading and loading more | Goal is reading/extraction, not clicking Next; grade returned content and progress. |

The original proposal called for independently authored layout pairs and five repetitions. The implemented pilot currently has 34 synthetic scenarios: five repetitions would mean 510 natural attempts and 240 controlled attempts, excluding observer, ablation, and private-replay calls. The two shell layouts share construction logic, so confirmation still needs independently sourced cases. Use the pilot to estimate variance, then choose the confirmation sample size from a predeclared minimum useful effect and freeze all prompts. If held-out failures inform a fix, retire that split and use new held-out cases. Report per-model results; one model does not establish cross-model validity.

## Labels and scoring

DOM instrumentation is an evaluation oracle only and is not supplied to the planner or observer. Record target and ancestor scroll offsets, target visibility/intersection, content landmarks, click effects, and timestamps around every action. For virtualized/delayed layouts, use offset plus rendered landmark traces rather than equating scrollTop with visual movement. Human-review ambiguous screenshot pairs before running the models. Annotators may assign uncertain and a set of permissible directions; do not force one direction when several are valid.

Evaluate three layers independently:

1. Observer: moved/unchanged/uncertain confusion matrix, false-stall rate on moving targets, missed-stall rate, unsupported-direction rate, and uncertain rate. Run frozen screenshot pairs without task-history hints. Include both target and outer-region labels.
2. Trigger: review eligibility, actual invocation, target-reset behavior, and delay from the first confirmed stall. A correct observer that never gets called is not a successful recovery.
3. End-to-end: task completion from deterministic page state or expected extracted content; strict instruction compliance; harmful extra actions; remaining repeated no-progress actions; recovery latency in actions and time. Grade allowed alternative action sequences by their outcome rather than requiring a specific next action.

Report completion-rate differences with paired, scenario-clustered confidence intervals; repetitions of one layout are not independent scenarios. Report each family and model, not only the pooled average. Always include trigger coverage and failures in the denominator. Separate infrastructure/model-service failures from task failures while also reporting all-attempt success and infrastructure failure rate, so exclusions cannot inflate success.

Cost metrics: observer and total model calls, input/output/cached tokens, wall time p50/p95, action count, and budget-exhaustion rate, including failed runs. Keep a common action limit and wall-clock cap; report review overhead rather than silently granting the recovery arms extra budgets.

## Proposed release gates

Agree these thresholds before the confirmation run; do not choose them from its results:

- Held-out stalled-task completion improves by at least 10 percentage points over disabled recovery, with the paired 95% interval excluding zero.
- Normal-task completion is non-inferior within 5 percentage points; the lower confidence bound must exceed -5 points. If the sample cannot establish this, report inconclusive.
- Zero observed explicit-instruction violations or unsupported UI actions. Also report the uncertainty bound; zero observed is not proof of zero risk.
- Observer false-stall rate at most 5% on moving-target cases; publish counts and uncertainty.
- Publish cost and latency tradeoffs for intervals 2 and 3. Do not declare a universal default winner from completion alone.

## Artifacts and rollout

Store immutable manifests, JSONL attempt records, screenshots and self-contained HTML reports under the configured MIDSCENE_RUN_DIR. Each record includes case/split/arm/repetition IDs, source and fixture SHA, model configuration without credentials, ground truth, action/review traces, outcome, errors, usage and timings. Retain failed experiments.

Implement in order: deterministic fixture/oracle tests; frozen screenshot observer evaluation; natural and controlled task runner; aggregation with confidence intervals; held-out confirmation. Run model-free fixture checks in normal CI and explicitly opted-in model evaluations through the shared AI CI action. The existing private screenshot stays a local regression case and must not be committed as public fixture data.

## New boundary layouts

`EVAL_SUITE=boundary` selects four separately constructed synthetic layouts: an invoice comparison matrix, shipment board, expense ledger and release timeline. Two goals are left of the initial viewport, two are right. These do not use the regression card builder, but remain synthetic fixtures rather than independent real-site acceptance.

For controlled boundary confirmation, freeze `EVAL_PREFIX_SCROLLS=3` before running. Both arms execute the same three injected wrong-direction plans through the real Agent; these are deliberately induced stalls, not naturally sampled planner failures. The default remains two prefix plans for historical regression reproducibility. `EVAL_PREFIX_SCROLLS` accepts integers from 1 to 10 and is saved in the manifest along with the suite and selected fixture hash. Keep the same 14-action / 180-second budget, report every layout and trigger coverage, and do not select successful cases after seeing outcomes.

```sh
EVAL_SUITE=boundary EVAL_TRACK=controlled EVAL_PREFIX_SCROLLS=3 EVAL_ARMS=0,3 EVAL_REPETITIONS=3 pnpm exec node packages/web-integration/tests/evaluation/scroll-recovery/run.mjs
pnpm exec node --test packages/web-integration/tests/evaluation/scroll-recovery/boundary-fixtures.test.mjs
```

## Default-on candidate validation

Use `EVAL_ARMS=0,default` to compare disabled recovery with an aiAct call that omits the option. `3` is an explicit opt-in and permits visual fallback, so it does not test the native-only default policy. `EVAL_SUITE=routine` provides eight ordinary task layouts, including no-scroll forms/dialogs, moving lists, load-more and exact-count scrolling at a boundary. A result checker verifies instructions and page outcomes.

Repetitions estimate model variability; eight layouts remain eight scenario clusters. This pilot cannot establish a one-percentage-point non-inferiority margin or a one-percent upper bound on serious regressions. Preserve all failures and use representative independent workloads before changing release defaults.
