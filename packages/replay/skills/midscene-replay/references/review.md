# Commands and review

```sh
midscene-replay prepare-step case.yaml --case "Case name" --step 2
midscene-replay prepare-step case.yaml --case "Case name" --step 2 --record --out ./recording-new
midscene-test case.yaml --case "Case name" --replay=strict
midscene-replay verify case.yaml --case "Case name" --runs 3 --out ./midscene_run/verification-new
midscene-test case.yaml --replay=auto
```

Use --config when the Test config is outside cwd. `prepare-step` executes the real prefix and holds resources, variables and Agent at the selected node. Enter ends the handoff; target and suffix do not run. The native report shows the intentional stop, not a successful full Case. Prefix failure prevents a ready handoff. Only the paused node gets a long authoring timeout; ordinary execution timeouts stay intact.

`verify` executes a frozen authored project through Test in fresh Node processes, with retry 0 and strict replay. Each round retains native machine results and HTML report, Replay events and model transport counts in replay.json, and console.log. It creates steps.md and per-run review.png from actual native screenshots. No independent HTML renderer. Source changes invalidate the entire group; a one-round run is diagnostic.

Keep YAML, scripts, imported helpers, configuration, reset logic and local fixtures within the authored project. Verification snapshots all files except installed dependencies, generated outputs and env files. Local ESM imports escaping the snapshot are rejected. Installed package versions/lockfiles are recorded in the project; environment values are fingerprinted without copying credentials. External services and mutable server data are not frozen. This is reproducibility checking, not a security sandbox. Native plugins may still use filesystem APIs, so review their inputs and report external dependencies honestly.

Use the existing beforeEach reset/start assertions and describe actual context/tab/business-state isolation. The provided Web setup reports browser facts and optional start observations; business state defaults to unknown. Do not turn unknown into reset merely because a new browser was launched.

Review each numbered result against the source goal/recording. Check actual images and data, negative cases, application identity and side effects. Separate program execution from human/Agent review in acceptance.md. Native metrics, replay phaseMs, named waits and model request timings explain latency; process startup and report generation are additional wall time.
