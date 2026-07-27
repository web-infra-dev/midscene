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
| `src/playwright.ts` | The `./playwright` entry: fixtures (`agent`, `agentForPage`, `agentOptions`, private `__reportMeta`), `defaultPlaywrightOptions`, and the `MidsceneTest` type. Also the single import site — see "Nothing upstream gets hidden" below. |
| `src/reporter.ts` | The `./reporter` entry: `MidsceneReporter`, which merges each test file's reports. |
| `src/report-helper.ts` | Report metadata derivation (`buildReportMeta`) and the worker-side manifest append (`collectReport`). |
| `src/utils.ts` | Manifest directory resolution and the per-file manifest key. |
| `tests/unit-test/` | Vitest. Pure functions plus a `.test-d.ts` guarding the sealed-fixture types. |
| `tests/smoke/` | Rstest + a real browser. Exercises fixture wiring; constructs an agent but makes no AI call. |
| `demo/` | Runnable example project, also the target of `test:demo`. |

## Nothing upstream gets hidden

This package is `@midscene/web/playwright` + `@rstest/playwright` fused into
one entry, so the standing rule is that a user must not lose access to either
half by going through it. Concretely:

- **Options are derived, never restated.** `AgentOptions` is
  `WebPageAgentOpt` minus the same keys `PlaywrightAiFixtureOptions` omits, and
  `RstestCache` is `CacheConfig` with `id` relaxed. New upstream options are
  reachable without touching this package. Both have already regressed once by
  being hand-written — `cacheDir` was silently unreachable — so keep them
  derived.
- **No upstream fixture is intercepted.** Only `agent`, `agentForPage`,
  `agentOptions` and `__reportMeta` are ours. `playwright` gets a default value
  and nothing else; `page` / `browser` / `context` / `request` / `serve` are
  untouched, which is what keeps PWDEBUG pause-on-failure and trace capture
  working.
- **`export * from '@rstest/playwright'`**, so the Rstest half stays complete
  as it grows. The local `test` shadows upstream's, which is the intent.
- **The Midscene half is re-exported by hand, on purpose.** A star re-export
  would drag in `PlaywrightAiFixture` and friends — the Playwright Test
  integration, wrong runner, actively misleading here. Export what the fixtures
  hand back (`PlaywrightAgent`) plus the config escape hatch
  (`overrideAIConfig`); add to it when a new symbol becomes necessary to type
  what users touch.

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
`getMidsceneRunSubDir('tmp')/rstest-manifest/<runId>`, with each file's manifest
keyed by a sha1 prefix of the test path.

**The manifest dir is namespaced per run.** `MidsceneReporter` clears the whole
directory at `onTestRunStart` (crash recovery) and at `onTestRunEnd`, so an
unscoped directory would mean two rstest processes started against the same
project deleting each other's pending manifests — and a missing manifest reads
as "no agent ran in this file", so the reports would disappear without an error.
Importing `reporter.ts` claims the id into `MIDSCENE_RSTEST_RUN_ID`: the config
module is evaluated in the main process before any worker exists, and the node
pool spawns workers with `{ ...process.env }`, so they inherit it. It is claimed
at module load rather than in the constructor so that merely constructing a
reporter does not mutate global process state. `ensureRunId` keeps an inherited
id rather than claiming a second one, in case rstest evaluates the config in a
worker too. Rstest 0.11 has no Vitest-style `provide`/`inject`; the only other
main→worker channel is `globalSetup`'s env overlay, which would force every user
to add a second config entry.

**Without a reporter, nothing is written.** Manifests exist only for the
reporter to drain, so `collectReport` warns once and skips the append when no
run id was claimed. Writing them anyway would grow a file nothing ever reads or
truncates — `collectReport` appends, and only the reporter deletes.

**`agent`, `agentForPage`, and `__reportMeta` are sealed against `test.extend`.**
Enforcement is type-level only (`SealedFixtureKeys` + the `MidsceneTest` type,
mirroring how `@rstest/playwright` specializes `@rstest/core`'s `extend`);
runtime fixture semantics are untouched. The reason is that an Rstest fixture
override cannot consume the base value, so a replacement would silently bypass
report collection. Custom fixtures are expected to *depend on* these instead.

**`agentForPage` depends on `agent` so its teardown runs first.** Secondary
agents must be collected while their pages are still alive.

**A report that cannot be produced fails the test.** Secondary collection keeps
going after one agent throws — a bad page should not cost the others their
report — but the failures are rethrown together as an `AggregateError` instead
of being logged away. Same rule in the reporter: only `ENOENT` on the manifest
is swallowed, because that is the ordinary "no agent ran in this file" case;
any other read error is rethrown with the manifest path attached. A run with
half a report is not a run that passed.

**Fixture overrides replace wholesale — there is no implicit merging.** That is
upstream Rstest semantics, and it is why `defaultPlaywrightOptions` is exported
at all: users spread it to keep the defaults.

**`cacheId` and `reportFileName` are deliberately different.** `reportFileName`
goes through `getReportFileName`, which appends a timestamp and uuid. `cacheId`
is `${projectRelativeFile}(${taskName})` with no timestamp, so retries and
re-runs of the same test land in the same cache namespace.

**`cacheId` identifies the file by path, not by basename.** It is the same shape
`@midscene/web/playwright` derives from Playwright's `titlePath[0]`, which is
also a project-relative path. A basename is not an identity —
`e2e/login/smoke.test.ts` and `e2e/checkout/smoke.test.ts` share one — and cache
entries match on the prompt alone, with no page or URL check, so two tests
sharing a namespace can replay each other's cached plan against the wrong page.
The path is taken relative to `task.projectRoot` and separator-normalized, so
the id survives a different checkout location and a different OS.

**`groupName` comes from the file basename.** Rstest does not expose the
surrounding `describe` name in the test context. That also means `cacheId`
cannot separate two same-named tests in different `describe` blocks of one
file — unlike the Playwright integration, which folds the whole `titlePath` in.
Users who hit it can set `cache.id` explicitly.

## Known rough edges

- `deriveStatus` substring-matches `'timed out'` on the error message, the way
  Vitest does. Replace it once Rstest surfaces a structured timeout flag.
- The JSONL manifest may be replaceable by `task.meta`. Rstest copies it to
  `TestResult.meta`, which reaches `onTestFileResult` as `file.results[i].meta`,
  and it assigns it *after* fixture cleanup — so a write from `collectReport`
  would land. That would delete the run-id namespace, the manifest files, and
  the ENOENT handling along with it. Not attempted yet: it needs checking
  against `retry`/`repeats`, and a worker that crashes mid-file would lose its
  entries where an on-disk manifest survives.
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
pnpm build          # rslib, two ESM entries + unbundled dts; type-checks too
pnpm test           # vitest, tests/unit-test only
pnpm test:smoke     # rstest + a real browser
pnpm test:demo      # runs demo/ as a project
```

Type checking rides on `build` via the shared `createTypeCheckPlugin`, and the
root `pnpm type-check:tests` covers `tests/` — there is no package-local
`typecheck` script.

`test:smoke` honors `SMOKE_BROWSER_CHANNEL=chrome` to use a system Chrome when
the Playwright-managed Chromium is not downloaded.
