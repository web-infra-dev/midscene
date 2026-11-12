# Scroll recovery evaluation proposal

Status: proposed benchmark, not an implemented runner or a validation result.

The existing six browser checks demonstrate completion with recovery enabled. They do not measure improvement against disabled recovery. The original screenshot pair has been used repeatedly during prompt development and is a development regression case, not a held-out evaluation. The neutral-prompt experiments also showed that passing the browser fixture does not guarantee recovery on that pair.

## Questions and comparisons

Compare disabled recovery, interval 2, and interval 3 on identical initial states. Freeze source SHA, fixture SHA, model identifier, adapter/configuration, viewport, action budget and timeout. Randomize arm order within each case/repetition; create a fresh page and Agent, disable cache, and retain every attempt. Do not retry failed attempts into the primary success rate. Report retry results separately.

Use two tracks, with separate results:

- Natural tasks: no injected wrong scrolls or suggested directions. Measures whether recovery improves the user's task overall, including cases where it never triggers.
- Controlled stalls: inject the same recorded erroneous prefix into every arm, then let the actual execution loop continue. Measures recovery conditional on a known stall. Do not call this natural task success or substitute direct observer calls for the execution loop.

For mechanism analysis, add an evaluation-only observer-feedback arm without history projection. Compare it with full recovery on the development split to determine whether the history rewrite is needed. Do not expose this as a new product option.

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

Start with two independently authored layouts per family (28 scenarios), balanced across development and held-out splits. Hold out whole layouts/templates, not just labels or viewport changes. Run five repetitions per arm for the pilot (28 × 3 × 5 = 420 task runs per model per track; 840 if both tracks cover all scenarios). This estimates variance; it is not enough by itself to establish reliability. Before a confirmation run, choose the sample size from pilot variance and a predeclared minimum useful effect, then freeze all prompts. If held-out failures inform a fix, retire that split from confirmation and use new held-out cases. Report per-model results; one model does not establish cross-model validity.

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
