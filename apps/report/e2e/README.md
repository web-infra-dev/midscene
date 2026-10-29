# Report e2e coverage

Report e2e tests exercise core user workflows against generated reports with real Agent recordings. Run `pnpm --filter @midscene/report e2e` with model credentials configured. The command builds the report and CLI, generates fixtures, and runs all YAML suites through Midscene Test before summarizing failures. The project sets `test.bail: 0` so a failed Case does not prevent later files from running. Any failed suite still makes the command fail.

## Development principle

Report development, review and testing prioritize core workflows and data correctness. Keep routine iterations focused on whether users can read results, navigate Cases and inspect failures and evidence. Spacing, colors, borders, shadows, corner radii, icon appearance and exact dimensions should not become default acceptance criteria or trigger repeated validation unless an explicit design requirement calls for them.

Content clipping, overlap, scrolling or keyboard problems that hide important information or block an action are functional defects. Test the affected workflow with concise outcome assertions. Purely cosmetic changes generally do not need automated assertions; avoid moving fragile style checks from e2e into unit tests.

The repository-wide policy is documented in [Report Development and Test Scope](../../../CONTRIBUTING.md#report-development-and-test-scope).

## Outcome semantics

Use final outcomes everywhere: Passed, Failed and Not run. Passed includes Cases that recover after earlier failed attempts. The outlined portion of the Passed bar, its “passed after retry” legend count, and warnings beside names describe history; they are not another category or additional Cases. Project groups, filters, counts and outcome sorting follow the same rule. Opening a passed Case shows its final attempt, while earlier-failure links and Attempts retain access to failed executions. Whole-file recovery remains in File attention and the Project warning; an always-passing Case does not inherit that warning. File and Project scope errors remain failures independently of their Case pass rates.

## What belongs here

- Load Agent, merged, legacy YAML and native Test reports.
- Filter, search, sort and expand the Project / File / Case hierarchy.
- Navigate between Cases and preserve overview state, including browser history.
- Inspect retries, setup/cleanup failures, errors and cumulative Case token usage, including the model usage tooltip.
- Inspect recordings, screenshots, JSON, task information and runtime events.
- Use playback, model details, theme switching and the mobile Steps/Player flow.

Keep assertions short and describe the observable result of an action. Locators should include enough context to distinguish overlapping controls, such as Replay all tasks versus the single-task Replay tab, or the All cases drawer versus the execution steps list. Assert sorting through the resulting row order rather than the appearance of an arrow. Use exact fixture values for data correctness, independently of their visual arrangement.

Verify view switches through their content, such as screenshot capture information or structured JSON, rather than the visual selected state of a tab. For responsive icon-only actions, exercise the action and verify its result instead of requiring a visible text label.

Do not depend on a full source path or filename being visible: CI paths can be long and intentionally truncated. Locate a File through its Project and hierarchy when its name is not the behavior under test. Before interacting with controls covered by a hover preview, move the pointer to a neutral target such as the Case title. Distinguish the selected Step's Record / Information / Events tabs from controls inside its embedded Agent recording; use `deepLocate` when the target needs closer inspection.

Retain `aiAssert`, `aiTap`, `aiHover` and related AI coverage. Reserve JavaScript for browser integration that needs deterministic checks, such as history/hash changes, focus, native select events or comparing a value before and after navigation. Avoid assertions about CSS classes, colors, borders, spacing, dimensions and screenshot coordinates.

Put aggregation rules, serialization limits, state transitions and functional calculations in the nearest unit tests. Add e2e coverage when browser integration or a user workflow is necessary. Each scenario should cover one workflow; avoid repeating the same navigation and visual checks across suites.

Generated fixtures belong in ignored `dist/`. Keep the static pages unchanged during a run; concurrent builds clean that directory. When another build must run concurrently, copy the generated static pages to a temporary directory and adjust the static server's path in `midscene.config.ts` to serve that snapshot.
