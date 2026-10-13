# Report regression tests

[中文说明](./README.zh.md)

Report has two viewer paths: the Project/Case **Test Report**, and the standalone
Agent viewer used directly or embedded in a Case's **Record** tab. Keep both
paths covered when changing shared styles.

## Run checks

From the repository root:

```sh
pnpm exec nx test @midscene/report
pnpm exec nx build @midscene/report
pnpm run lint
```

The report unit target also parses every E2E YAML file. Parsing does not run the
browser scenarios or verify the AI assertions.

Run the full browser suite with a configured model and browser environment:

```sh
pnpm --filter @midscene/report e2e
```

This command builds Report and CLI, validates Core's embedded report template,
runs real model-backed demo flows, generates the fixtures, and runs the YAML
suite. It makes model calls. For a focused rerun after generating fixtures:

```sh
cd apps/report
pnpm exec node ../../packages/cli/bin/midscene ./e2e/midscene-test-report.yaml
pnpm exec node ../../packages/cli/bin/midscene ./e2e/midscene-test-lifecycle.yaml
pnpm exec node ../../packages/cli/bin/midscene ./e2e/midscene-test-late-failure.yaml
pnpm exec node ../../packages/cli/bin/midscene ./e2e/timeline-interaction.yaml
```

Rebuild Report and regenerate fixtures after UI changes. Existing HTML reports
embed their own UI and do not pick up edits to the app's source.
The focused commands run from `apps/report`; export the model environment
variables there, or load the root `.env` explicitly with Node's
`--env-file=../../.env` option.

## Coverage

| Scenario                                                                                  | Fixture                                | Main checks                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `midscene-test-report.yaml`                                                               | `demo-midscene-test.html`              | Project filters, Compact/Detailed rows, retries, Execution header controls, shared Step pane, Record/Information/Events, divider limits/reset, light/dark Events |
| `midscene-test-lifecycle.yaml`                                                            | `demo-midscene-test-lifecycle.html`    | Setup failures, blocked Cases, cleanup issues and issue drawer                                                                                                   |
| `midscene-test-late-failure.yaml`                                                         | `demo-midscene-test-late-failure.html` | Opening a failed Case reveals both the selected late Step and its error without manual scrolling                                                                 |
| `timeline-interaction.yaml`                                                               | `demo.html`                            | Legacy YAML opens Test Report; timeline selection opens the owning Step's Record tab                                                                             |
| `report-single.yaml`, `sidebar-navigation.yaml`, `detail-panel.yaml`, `theme-toggle.yaml` | `demo-agent.html`                      | Standalone Agent task list, timing, replay, details, Markdown and themes                                                                                         |
| `report-mobile.yaml`, `player-only.yaml`                                                  | `demo-agent.html`                      | Narrow-screen Steps/Player navigation, information drawer and player-only mode                                                                                   |
| `report-merged.yaml`                                                                      | `demo-merged.html`                     | Merged Agent case selection and status filtering                                                                                                                 |

Use the current visible labels **Test Report**, **Information**, and **Events**.
Events uses readable labels such as **Run step**, **Started**, and **Finished**;
raw operation/event names are retained in hover hints, not as visible cell text.
Attempts sits next to Visual/YAML inside Execution; Case cleanup issues remain
above Execution, while Step errors appear above the detail tabs.

Keep visual assertions and navigation on `aiAssert`, `aiTap`, and `aiHover`.
Use `javascript` only for deterministic DOM plumbing such as history or divider
keyboard events. Do not manually scroll to the selected failure in the entry
regression: that would conceal a broken automatic reveal.

`fixtures/test-report.mjs` keeps synthetic hierarchy and lifecycle outcomes
deterministic while using a real Agent recording. Generated HTML belongs in
ignored `dist/`; edit fixture sources and rebuild instead of editing HTML.

The Test Report palette lives in `src/components/test-runner/tokens.less`.
`index.less` loads shared structure, page layouts, responsive rules, Select,
and finally error-card styles. Preserve that cascade order. Unit assertions on
stylesheet source do not replace browser checks of the resulting layout.
