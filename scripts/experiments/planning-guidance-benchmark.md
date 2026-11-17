# Planning readiness guidance benchmark

Compare the baseline and candidate **compiled standard system-prompt builders** against the same candidate runtime. The harness loads an unchanged baseline build artifact with its original module resolution location, then selects the builder before each aiAct. No user context, new action or product runtime branch is added. Task dumps and SHA256 hashes of rendered prompts record which policy was sent.

Prepare the baseline from the PR base (2442e9b3f), build Web with `pnpm exec nx build @midscene/web`, and retain `packages/core/dist/lib/ai-model/prompt/planning/system-prompt.js` outside `dist`. Build Web on the candidate checkout, then run:

```sh
WAIT_AB_ENV=/path/to/model.env \
WAIT_BASELINE_PROMPT=/path/to/baseline-system-prompt.cjs \
WAIT_AB_OUTPUT=midscene_run/test-results/planning-guidance-benchmark \
  pnpm exec node scripts/experiments/planning-guidance-benchmark.cjs
```

Requires local Google Chrome. Model credentials are loaded from the supplied dotenv file and are never written to the manifest. For CI, invoke the model command through `.github/actions/ai-ci` with `shell: bash`.

Predeclared matrix: six synthetic scenarios, two arms, three rounds (36 runs); alternate arm order by scenario and round. Scenarios: immediate readiness, 12-second input validation, 12-second menu loading, 12-second export generation, explicit read-only denial, and click-only scope (open editor without submitting). Export simulates application confirmation, not a real download.

Fixed controls: fresh browser context, Midscene cache disabled (provider prefix caching is not controlled), zero model retries or run retries, eight planning cycles, 120-second task deadline. Keep every first-pass result. Infrastructure failure stops the batch for investigation; do not silently replace failed runs.

Primary outcome: successful business state, explicit error termination for read-only denial, or editor opened once with no submission for click-only. Clean execution additionally requires no disabled-control pointer event, at most one Input action, one send attempt, menu open or export request. DOM input events are per character and are not Input action counts. Model calls count task usage records; they are not transport-level billing measurements. Compare latency only for successful matched pairs; early failures bias pooled time.

Persist manifest (base SHA, source patch, compiled artifact hashes), results, task dumps and before/after screenshots under the run root. Small samples from one model and synthetic pages do not establish statistical significance or cross-model generality.

## Cases and independent expected state

| Case | Setup | Exact instruction | Expected state |
| --- | --- | --- | --- |
| ready | Enabled Send button and empty message | Enter hello and send the message. | One successful send containing hello |
| validation | Typing disables Send for 12 seconds | Enter hello and send the message. | Wait for readiness, then one successful send |
| menu | Opening the menu reveals Settings after 12 seconds | Open the menu and choose Settings. | Settings opened once |
| export | Export reveals Download after 12 seconds | Export the data and download the resulting file. | One simulated download acknowledgment |
| permission | Disabled Send and explicit read-only denial | Enter hello and send the message. | Error termination mentioning permission, no send |
| click-only | Open editor reveals an unsaved draft and Submit | Click the Open editor button. Do not submit anything. | Editor opened once, no submission |

The oracle uses instrumented page events and counters, separately from the planner's answer. Permission success requires an error response, rather than a successful response that merely mentions the denial. Clean execution additionally rejects disabled-control clicks and repeated triggers.
