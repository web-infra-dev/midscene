# Prompt-only planning benchmark results

Run date: 2026-11-17. Baseline main: 2442e9b3f060650693693c184c9e0eac80152c76. Candidate prompt: commit 713d76e964895302e74d33c3857d87d13f016a2f. The experiment began before this commit, with the exact source patch recorded in manifest.json. Both arms use the same runtime.

Model: qwen3.7-plus, family qwen3; six scenarios, three rounds per arm, alternating arm order. Fresh 1100×800 browser contexts; Midscene cache disabled, model/run retries zero. Provider-side prefix caching was observed and was not disabled; latency is exploratory.

| Scenario | Baseline: outcome; clean; calls | Candidate: outcome; clean; calls |
| --- | --- | --- |
| ready | 3/3; 3/3; 9 | 3/3; 3/3; 9 |
| validation | 3/3; 3/3; 19 | 3/3; 3/3; 18 |
| menu | 2/3; 2/3; 14 | 3/3; 3/3; 18 |
| export | 3/3; 3/3; 15 | 3/3; 3/3; 15 |
| permission | 0/3; 0/3; 10 | 2/3; 1/3; 7 |
| click-only | 3/3; 3/3; 6 | 3/3; 3/3; 6 |

Outcome includes correct error termination for read-only denial. Clean additionally excludes disabled-control clicks and repeated inputs/triggers. Export checks simulated application confirmation, not an actual file transfer.

Totals: baseline 14/18 outcomes, 14/18 clean, 73 model calls, 3 disabled-control clicks; candidate 17/18 outcomes, 16/18 clean, 73 calls, 2 disabled-control clicks.

For 14 matched successful non-permission pairs, baseline/candidate calls are 61/60, and total task latency 250.997/246.308 seconds. Total reported tokens across all runs: 749886/765405; these are not billed cost.

The candidate improves observed outcome reporting but remains unreliable on read-only denial: only 2/3 correct error terminations and 1/3 clean refusals. It does not demonstrate a general speed or cost benefit. The PR remains a draft for this reason.

## Failures and limitations

- permission-baseline-1: outcome failed; disabled clicks 1; 已在输入框中输入"hello"并点击了Send按钮。但系统显示错误："This account is read-only. Sending messages is not permitted."，表示该账户为只读账户，不允许发送消息。
- permission-candidate-1: outcome passed; disabled clicks 1; Task failed: 已输入"hello"，但由于账户是只读的（Error: This account is read-only. Sending messages is not permitted.），Send按钮被禁用，无法发送消息。

- menu-baseline-2: outcome failed; disabled clicks 0; XML parse error: Action type 'Wait' is not in the current action space. Available actions: Tap, DoubleClick, RightClick, MiddleClick, Hover, DragAndDrop, LongPress, Input, ClearInput, KeyboardPress, CursorMove, Scroll, Pinch, Navigate, Reload, GoBack, GoForward, RegisterFileChooserAccept, Sleep
- permission-baseline-2: outcome failed; disabled clicks 1; 已在输入框中输入"hello"并点击了Send按钮发送消息。但由于账户为只读模式，系统显示错误："This account is read-only. Sending messages is not permitted."，消息未能成功发送。
- permission-baseline-3: outcome failed; disabled clicks 1; 已在输入框中输入"hello"并点击了Send按钮。但系统显示错误："This account is read-only. Sending messages is not permitted."，表示该账户为只读模式，不允许发送消息。
- permission-candidate-3: outcome failed; disabled clicks 1; 已在Message输入框中输入"hello"并点击了Send按钮。但由于账户为只读权限（Error: This account is read-only. Sending messages is not permitted.），消息未能成功发送。

Every first-pass result is retained; failures were not rerun. One model and three repetitions per scenario cannot establish statistical significance, general latency gains, or cross-model reliability. Prompt guidance is not an execution guardrail.

## Provenance and reproduction

See [benchmark protocol](./planning-guidance-benchmark.md) for commands, fixture, and controls. The run manifest records compiled artifact hashes and the exact source patch. Rendered prompt SHA256:

- Baseline: `441201360bf413b4a11723a1c8e544b47cc8179740a537202a6fa8756e55bc3b`
- Candidate: `7f382a4de6f1f1bf65c29fffdea9aa04af80f191ff60279fdff0d82bfe425a80`

## All runs

| Run | Outcome | Clean | Model calls | Seconds | Disabled clicks |
| --- | --- | --- | --- | --- | --- |
| ready-baseline-1 | pass | pass | 3 | 10.380 | 0 |
| ready-candidate-1 | pass | pass | 3 | 8.954 | 0 |
| validation-candidate-1 | pass | pass | 6 | 27.875 | 0 |
| validation-baseline-1 | pass | pass | 6 | 27.023 | 0 |
| menu-baseline-1 | pass | pass | 6 | 25.822 | 0 |
| menu-candidate-1 | pass | pass | 6 | 25.658 | 0 |
| export-candidate-1 | pass | pass | 5 | 21.856 | 0 |
| export-baseline-1 | pass | pass | 5 | 21.906 | 0 |
| permission-baseline-1 | fail | fail | 3 | 11.815 | 1 |
| permission-candidate-1 | pass | fail | 3 | 12.934 | 1 |
| click-only-candidate-1 | pass | pass | 2 | 6.334 | 0 |
| click-only-baseline-1 | pass | pass | 2 | 6.032 | 0 |
| ready-candidate-2 | pass | pass | 3 | 8.863 | 0 |
| ready-baseline-2 | pass | pass | 3 | 9.310 | 0 |
| validation-baseline-2 | pass | pass | 7 | 32.546 | 0 |
| validation-candidate-2 | pass | pass | 6 | 28.558 | 0 |
| menu-candidate-2 | pass | pass | 6 | 26.674 | 0 |
| menu-baseline-2 | fail | fail | 2 | 5.610 | 0 |
| export-baseline-2 | pass | pass | 5 | 22.232 | 0 |
| export-candidate-2 | pass | pass | 5 | 21.865 | 0 |
| permission-candidate-2 | pass | pass | 1 | 3.132 | 0 |
| permission-baseline-2 | fail | fail | 4 | 14.587 | 1 |
| click-only-baseline-2 | pass | pass | 2 | 5.986 | 0 |
| click-only-candidate-2 | pass | pass | 2 | 6.096 | 0 |
| ready-baseline-3 | pass | pass | 3 | 8.388 | 0 |
| ready-candidate-3 | pass | pass | 3 | 8.848 | 0 |
| validation-candidate-3 | pass | pass | 6 | 27.672 | 0 |
| validation-baseline-3 | pass | pass | 6 | 28.548 | 0 |
| menu-baseline-3 | pass | pass | 6 | 25.596 | 0 |
| menu-candidate-3 | pass | pass | 6 | 26.002 | 0 |
| export-candidate-3 | pass | pass | 5 | 21.910 | 0 |
| export-baseline-3 | pass | pass | 5 | 21.524 | 0 |
| permission-baseline-3 | fail | fail | 3 | 10.647 | 1 |
| permission-candidate-3 | fail | fail | 3 | 11.462 | 1 |
| click-only-candidate-3 | pass | pass | 2 | 5.817 | 0 |
| click-only-baseline-3 | pass | pass | 2 | 5.704 | 0 |
