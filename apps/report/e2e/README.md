# Report e2e coverage

Report e2e tests exercise core user workflows against generated reports with real Agent recordings. Run `pnpm --filter @midscene/report e2e` with model credentials configured. The command builds the report and CLI, generates fixtures, and runs the YAML suites.

## What belongs here

- Load Agent, merged, legacy YAML and native Test reports.
- Filter, search, sort and expand the Project / File / Case hierarchy.
- Navigate between Cases and preserve overview state, including browser history.
- Inspect retries, setup/cleanup failures, errors and cumulative Case token usage.
- Inspect recordings, screenshots, JSON, task information and runtime events.
- Use playback, model details, theme switching and the mobile Steps/Player flow.

Keep assertions short and describe the observable result of an action. Locators should include enough context to distinguish overlapping controls, such as Replay all tasks versus the single-task Replay tab, or the All cases drawer versus the execution steps list. Assert sorting through the resulting row order rather than the appearance of an arrow. Use exact fixture values for data correctness, independently of their visual arrangement.

Retain `aiAssert`, `aiTap`, `aiHover` and related AI coverage. Reserve JavaScript for browser integration that needs deterministic checks, such as history/hash changes, focus, native select events or comparing a value before and after navigation. Avoid assertions about CSS classes, colors, borders, spacing, dimensions and screenshot coordinates.

Put aggregation rules, serialization limits, component rendering and sizing calculations in the nearest unit tests. Add e2e coverage when browser integration or a user workflow is necessary. Each scenario should cover one workflow; avoid repeating the same navigation and visual checks across suites.

Generated fixtures belong in ignored `dist/`. Keep the static pages unchanged during a run; concurrent builds clean that directory. When another build must run concurrently, copy the generated static pages and YAML suites to a temporary directory and change only `target.serve` to point at the copied pages.
