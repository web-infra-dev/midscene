# Artifact and logging conventions

[中文](./artifacts.zh.md)

This guide defines the conventions for Midscene contributors changing artifact
paths, recording, report publication, exports, or logging. For user configuration,
see [Agent report options](../apps/site/docs/en/reference/index.mdx#report-options)
and [running Midscene Test](../apps/site/docs/en/midscene-test/running.mdx).

## Directory responsibilities

The default artifact root is `midscene_run/`. New runtime artifacts belong under
this root, with explicit user path overrides respected.

| Directory                             | Responsibility                                                                  | Retention rule                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `report/`                             | Agent reports and Midscene Test integrated reports                              | A single HTML or a complete external report directory is the delivery unit.                   |
| `test-results/<runId>/`               | Native Test results, plans, operation records, attempts, and diagnostic sources | Keep the complete run directory for analysis, including failed attempts and lifecycle errors. |
| `test-results/<recordingId>/records/` | Legacy YAML snapshots and their diagnostic images                               | Keep snapshots and their referenced images together.                                          |
| `cache/`                              | Reusable execution caches                                                       | Cache loss must not remove diagnostic evidence.                                               |
| `log/`                                | SDK diagnostic logs                                                             | Logs supplement structured results.                                                           |
| `output/`                             | Files produced by actions                                                       | Preserve user-selected output paths.                                                          |
| `tmp/`                                | Midscene temporary working files                                                | Clean only files owned by the operation.                                                      |
| `cli-report-session/`                 | Private session state for platform and Skill CLIs                               | Keep append state separate from report delivery.                                              |

The root is a working directory, not a package to publish in full. Choose the
report and required results for delivery. Existing OS temporary files used for
device/browser connections or immediate CLI image responses are not report
dependencies; delivery must not rely on them.

Both report types use the same organization:

```text
midscene_run/report/
  <name>.html                    # single-html, the default
  <name>/                       # html-and-external-assets
    index.html
    report.json                 # Manifest and report metadata
    data/                       # Execution data
    screenshots/                # Shared image files within this report
```

Standalone Agent names are generated unless `reportFileName` is configured.
Native Test uses `midscene-e2e-<runId>` and publishes one integrated report;
its Agents record data through the host session without publishing separate
Agent HTML files. The Test format comes from `output.reportFormat`; standalone
Agent and legacy YAML formats come from `outputFormat`.

Legacy YAML snapshots live under `test-results/` for both report formats.
Consecutive YAML calls on the same Agent share a recording directory and retain
separate snapshots. The explicit `persistExecutionDump` option is separate: for
single HTML it adds raw JSON under `report/.execution-dumps/<html-filename>/`.
Those dumps can reference images under `report/screenshots/`; keep their
dependencies together. Do not enable extra raw dumps as part of normal report
generation.

## Resolve paths through the shared context

- Use `getMidsceneRunSubDir()` from `@midscene/shared/common` when adding files.
  Resolve the directory during the operation, not once when importing a module.
- Native Test resolves `output.runDir` and `MIDSCENE_RUN_DIR` relative to the Test
  project. Standalone Agent, legacy YAML, and Playwright use their working
  directory. Native Test's explicit `output.reportDir` is project-relative;
  `--result-dir` is relative to the command's working directory.
- Test hosts use `resolveMidsceneRunDir()` and `runWithMidsceneRunDir()` to share
  an absolute root with SDK calls. Preserve asynchronous isolation, including
  across ESM and CJS packages. Avoid changing `process.env` or `process.cwd()` to
  switch between concurrent runs.
- The lookup order is asynchronous run context, process-level
  `setMidsceneRunDir()`, environment, then the default. Explicit Test configuration
  and environment must resolve to the same root. Empty, conflicting, or unwritable
  roots must fail visibly; do not redirect output to another location.
- Integrations should use returned `summaryPath`, `markdownPath`, and `reportPath`.
  `loadTestProject().output` holds configuration, not final resolved output paths.
  Resolve relative Summary references from the Summary file's directory.

For example, resolve `getMidsceneRunSubDir('output')` inside an action. A directory
captured at module initialization could send the next Test project's files to
the previous project's root.

## Recording and cleanup

1. **The host owns recording.** Native Test creates a `ReportSession`; Agent
   writers contribute structured records. Use `ReportGenerator` for standalone
   reports and the shared source-snapshot path for legacy YAML. Keep nested YAML
   records attached to the owning run.
2. **Freeze evidence at one cutoff.** Capture execution contents, collection
   time, and busy/partial state before awaiting disk I/O. An operation that
   finishes while images are being written must not make an incomplete snapshot
   appear complete. Late results must not rewrite delivered snapshots.
3. **Retain diagnostics before releasing writers.** Capture uncollected
   setup/teardown records, then release live execution references and callbacks
   when the writer finishes. Preserve timeout, failure, interruption, skip, and
   retry information through merge and export.
4. **Prune replaceable progress after delivery.** Native Test prunes only after
   report publication and preceding result writes succeed, and only when writers
   are idle. It removes progress `records/data/`, `records/report.json`, and
   unreferenced images. Immutable snapshot JSON and its images remain. The final
   Summary is written after this cleanup. A failed publication must retain the
   sources needed for diagnosis.
5. **Separate completion from success.** Manifest `complete` describes recording
   completion, not a passed test. Aggregate all writer states: one finished writer
   cannot mark a report complete while another writer is still running.

## Publication, images, and memory

- Keep self-contained `single-html` as the default. External reports use the
  shared manifest, execution data, and image layout above. Use the existing
  readers/writers and publication helpers instead of building another HTML parser
  or copying the whole working root.
- Deduplicate image bytes by content in external reports, `split`, and Markdown
  export. Keep each observation's ID, timestamp, and step association. Consumers
  read exported image paths; an observation ID is not a file name.
- A delivered report must remain readable after relocation. Include referenced
  assets, keep delivery paths relative, and reject references that escape the
  published report. Validate dependencies before replacing a previous output.
- Lock the complete read/merge/write transaction across processes for shared
  manifests and report destinations. Atomic rename alone does not prevent lost
  updates. Preserve other writers and aggregate their states.
- `overwrite` replaces only the actual output target. For example, exporting
  `run.html` to `run/index.html` must preserve the source HTML and unrelated
  sibling files. Remove consumed source reports only after successful publication
  when `rmOriginalReports` was explicitly requested.
- Keep progress writes asynchronous and ordered. Process image bytes
  incrementally rather than retaining every decoded image, Base64 copy, or old
  execution object. Offline conversion tools may use synchronous entry points;
  the execution hot path must not synchronously rescan a large HTML on each step.
- Report serialization schemas do not require legacy-format shims. Changes to
  public configuration, default formats, or output paths still require user
  documentation and downstream integration checks.

## Logging

Use the shared logger in package code:

```ts
import { getDebug, logReport } from '@midscene/shared/logger';

const debug = getDebug('report:publish');
const warn = getDebug('report:publish', { console: true });

debug('Published report %s', reportPath);
warn('Optional diagnostic unavailable for run %s: %s', runId, reason);
logReport(`Report: ${reportPath}`);
```

- Choose a stable `module:topic`. The logger adds the `midscene:` namespace;
  the example uses `DEBUG=midscene:report:publish` and writes to
  `<runDir>/log/report-publish.log`. In Node.js, file logging works without
  enabling terminal debug output.
- Use `getDebug(topic, { console: true })` for user-visible package warnings so
  the warning reaches both the file log and the terminal or scoped CLI reporter.
  Use `logReport()` for report-path notifications. Throw or propagate operational
  errors so results and exit codes reflect failure.
- Test hosts route messages through `runWithConsoleLogHandler()` and attach
  project/file/case context with `runWithConsoleLogScope()`. Keep late messages in
  their original scope. Direct package `console.warn()` or `console.log()` can
  bypass this routing; CLI renderers own their terminal presentation.
- Log identifiers, paths, counts, and concise error reasons. Avoid complete dump
  JSON, Base64 images, environment values, API Keys, and credentials. Explicit
  model/debug recordings can contain sensitive payloads and need their own
  retention controls.
- File logs are best effort: they may drop messages under backpressure or after
  a stream error. Store required execution evidence in structured results.
  Log stream or console write failures must not crash the application or mask the
  original error. Invalid or unwritable artifact roots still follow the path
  error rules above.
- When changing the logger, keep pending bytes and stream counts bounded while
  switching roots. End replaced streams; an ended stream may emit `finish`
  without `drain`. Clear backpressure only for that exact stream, after it flushes
  or errors, so an old callback cannot reset a new stream's state.

## Consumers and required regression checks

| Area changed             | Check these behaviors                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root resolution          | Defaults, custom/absolute roots, explicit overrides, configuration conflicts, concurrent projects, and ESM/CJS context sharing.                     |
| Report recording         | Standalone Agent, legacy YAML including setup failure, Native Test without extra Agent HTML, retries/timeouts, and snapshot cutoff consistency.     |
| Report formats and tools | Both formats through merge, export, split, and Markdown; status preservation, image deduplication, relocation, and missing assets.                  |
| Shared publication       | Separate processes appending to the same report; overwrite preserves sources and unrelated files; partial publication retains evidence.             |
| Viewer and integrations  | Report loading and replay in Playground, Playwright reporting, platform/Skill CLI append across processes, and CI Summary/upload/publication paths. |
| Resource lifecycle       | Repeated screenshots under a memory budget; writer release; real log streams under backpressure, root switching, and stale callbacks.               |

Start with nearby suites:
[path resolution](../packages/test/tests/artifact-paths.test.ts),
[Test artifact pipeline](../packages/test/tests/report-artifact-pipeline.test.ts),
[sessions](../packages/core/tests/unit-test/report-session.test.ts),
[publication](../packages/core/tests/unit-test/report-artifact.test.ts),
[export](../packages/core/tests/unit-test/report-export.test.ts),
[memory budgets](../packages/core/tests/unit-test/report-memory-budget.test.ts),
[CLI sessions](../packages/shared/tests/unit-test/cli-report-session.test.ts), and
[real log streams](../packages/shared/tests/unit-test/logger-stream-lifecycle.test.ts).
Use actual generated reports when testing consumers; handwritten HTML alone
cannot catch missing directory-data routes or replay readers.

For affected projects, run the smallest relevant Nx tests and builds following
[CONTRIBUTING.md](../CONTRIBUTING.md). Run `pnpm run lint` before committing.
Documentation-only changes need formatting, link checks, and lint rather than
model or device runs. Keep user docs focused on configuration and usage; update
this guide when internal artifact or logging conventions change.
