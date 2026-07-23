# @midscene/rstest

Maintainer notes. User-facing usage docs are not kept here — they live in the
Rstest documentation site.

A thin layer over [`@rstest/playwright`](https://www.npmjs.com/package/@rstest/playwright):
it adds Midscene agent fixtures and an Rstest reporter that merges Midscene's
HTML reports. Upstream's `page` / `browser` / `context` fixtures and its whole
debug/trace lifecycle are passed through untouched — this package deliberately
owns as little as possible.

## Layout

| Path | Role |
| --- | --- |
| `src/playwright.ts` | The `./playwright` entry: fixtures (`agent`, `agentForPage`, `agentOptions`, private `__reportMeta`), `defaultPlaywrightOptions`, and the `MidsceneTest` type. Re-exports upstream's `expect` / hooks / option types so users have one import site. |
| `src/reporter.ts` | The `./reporter` entry: `MidsceneReporter`, which merges each test file's reports. |
| `src/report-helper.ts` | Report metadata derivation (`buildReportMeta`) and the worker-side manifest append (`collectReport`). |
| `src/utils.ts` | Manifest directory resolution and the per-file manifest key. |
| `tests/unit-test/` | Vitest. Pure functions plus a `.test-d.ts` guarding the sealed-fixture types. |
| `tests/smoke/` | Rstest + a real browser. Exercises fixture wiring; constructs an agent but makes no AI call. |
| `demo/` | Runnable example project, also the target of `test:demo`. |

## Constraints that shape the design

These are the reasons the code is not simpler. Changing any of them needs care.

**`isolate: false` drives everything.** With a shared module registry the entry
module is evaluated once per worker, not once per test file. So this module
registers no module-level hooks and holds no per-file state — a module-level
`afterAll` would bind to whichever file happened to load it first, and every
later file would silently lose its report. Anything per-file is derived from
`task.filepath`.

**Report merging lives in the reporter, not in a worker hook.** That is the
direct consequence of the above: workers append one JSONL entry per test to a
per-file manifest, and `MidsceneReporter.onTestFileResult` — which fires per
file in the main process regardless of `isolate` — drains and merges it through
`ReportMergingTool`. The manifest dir sits under
`getMidsceneRunSubDir('tmp')/rstest-manifest`, keyed by a sha1 prefix of the
test path. `onTestRunStart` pre-cleans it in case a previous run crashed.

**`agent`, `agentForPage`, and `__reportMeta` are sealed against `test.extend`.**
Enforcement is type-level only (`SealedFixtureKeys` + the `MidsceneTest` type,
mirroring how `@rstest/playwright` specializes `@rstest/core`'s `extend`);
runtime fixture semantics are untouched. The reason is that an Rstest fixture
override cannot consume the base value, so a replacement would silently bypass
report collection. Custom fixtures are expected to *depend on* these instead.

**`agentForPage` depends on `agent` so its teardown runs first.** Secondary
agents must be collected while their pages are still alive.

**Fixture overrides replace wholesale — there is no implicit merging.** That is
upstream Rstest semantics, and it is why `defaultPlaywrightOptions` is exported
at all: users spread it to keep the defaults.

**`cacheId` and `reportFileName` are deliberately different.** `reportFileName`
goes through `getReportFileName`, which appends a timestamp and uuid.
`cacheId` is `${fileBase}(${taskName})` with no timestamp, so retries and
re-runs of the same test land in the same cache namespace.

**`groupName` comes from the file basename.** Rstest does not expose the
surrounding `describe` name in the test context.

## Known rough edges

- `deriveStatus` substring-matches `'timed out'` on the error message, the way
  Vitest does. Replace it once Rstest surfaces a structured timeout flag.
- `task.filepath` requires `@rstest/core >= 0.11.2`; its absence throws with an
  explicit message rather than degrading.
- Playwright is the only browser engine. The engine is in the import path
  (`@midscene/rstest/playwright`) to mirror `@midscene/web`, so adding another
  one means adding an entry, not a runtime branch.

## Coupling to watch

- **`packages/cli` pins `@rstest/core` too.** The CLI's YAML runner
  (`src/framework/rstest-runner.ts`) depends on the same major, so version
  bumps have to move together — and 0.11 changed scheduling and pool options,
  which the CLI tests assert on.
- **`@midscene/core` internals**: `ReportMergingTool` (`/report`),
  `getReportFileName` and `printReportMsg` (`/agent`), `processCacheConfig`
  (`/utils`). These are peer-dependency imports, not public API contracts.
- **Only `@midscene/shared` is a runtime dependency.** `@midscene/core`,
  `@midscene/web`, `@rstest/core`, `@rstest/playwright`, and `playwright` are
  all peers; keep it that way so consumers control the versions.

## Commands

```bash
pnpm build          # rslib, two ESM entries + unbundled dts
pnpm test           # vitest, tests/unit-test only
pnpm test:smoke     # rstest + a real browser
pnpm test:demo      # runs demo/ as a project
pnpm typecheck      # tsc --noEmit
```

`test:smoke` honors `SMOKE_BROWSER_CHANNEL=chrome` to use a system Chrome when
the Playwright-managed Chromium is not downloaded.
