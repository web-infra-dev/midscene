# Report e2e coverage

Report e2e tests exercise core user workflows against generated reports with real Agent recordings. Run `pnpm --filter @midscene/report e2e` with model credentials configured. The command builds the report and CLI, generates fixtures, and runs the YAML suites.

## Development principle

Report development, review and testing prioritize core workflows and data correctness. Keep routine iterations focused on whether users can read results, navigate Cases and inspect failures and evidence. Spacing, colors, borders, shadows, corner radii, icon appearance and exact dimensions should not become default acceptance criteria or trigger repeated validation unless an explicit design requirement calls for them.

Content clipping, overlap, scrolling or keyboard problems that hide important information or block an action are functional defects. Test the affected workflow with concise outcome assertions. Purely cosmetic changes generally do not need automated assertions; avoid moving fragile style checks from e2e into unit tests.

The repository-wide policy is documented in [Report Development and Test Scope](../../../CONTRIBUTING.md#report-development-and-test-scope).

## Outcome semantics

Use final outcomes everywhere: Passed, Failed and Not run. Passed includes Cases that recover after earlier failed attempts. The amber portion of the Passed bar and warning icons describe history; they are not another category or additional Cases. Project groups, filters, counts and outcome sorting follow the same rule. Opening a passed Case shows its final attempt, while earlier-failure links and Attempts retain access to failed executions. Whole-file recovery warns at the File/Project scope; an always-passing Case does not inherit that warning. File and Project scope errors remain failures independently of their Case pass rates.

## What belongs here

- Load Agent, merged, legacy YAML and native Test reports.
- Filter, search, sort and expand the Project / File / Case hierarchy.
- Navigate between Cases and preserve overview state, including browser history.
- Inspect retries, setup/cleanup failures, errors and cumulative Case token usage, including the model usage tooltip.
- Inspect recordings, screenshots, JSON, task information and runtime events.
- Use playback, model details, theme switching and the mobile Steps/Player flow.

Keep assertions short and describe the observable result of an action. Locators should include enough context to distinguish overlapping controls, such as Replay all tasks versus the single-task Replay tab, or the All cases drawer versus the execution steps list. Assert sorting through the resulting row order rather than the appearance of an arrow. Use exact fixture values for data correctness, independently of their visual arrangement.

Retain `aiAssert`, `aiTap`, `aiHover` and related AI coverage. Reserve JavaScript for browser integration that needs deterministic checks, such as history/hash changes, focus, native select events or comparing a value before and after navigation. Avoid assertions about CSS classes, colors, borders, spacing, dimensions and screenshot coordinates.

Put aggregation rules, serialization limits, state transitions and functional calculations in the nearest unit tests. Add e2e coverage when browser integration or a user workflow is necessary. Each scenario should cover one workflow; avoid repeating the same navigation and visual checks across suites.

Generated fixtures belong in ignored `dist/`. Keep the static pages unchanged during a run; concurrent builds clean that directory. When another build must run concurrently, copy the generated static pages and YAML suites to a temporary directory and change only `target.serve` to point at the copied pages.
