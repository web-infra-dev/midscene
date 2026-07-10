# Rstest Migration Workarounds

Central registry of test cases that are **skipped** or carry an **ugly
workaround** specifically because of `@rstest/core` limitations encountered
during the vitest → rstest migration. Each entry exists only until the
referenced rstest fix lands; when it does, revert the workaround and delete the
entry.

Every workaround in the codebase is marked with a `// TODO(rstest): ...` comment
next to the code, so `grep -rn "TODO(rstest)"` is the source of truth. This file
is the human-readable index of those markers.

**Out of scope** (do not add here): pre-existing skips unrelated to rstest —
e.g. tests skipped for an outdated Agent API (`aiaction-cacheable.test.ts`),
long-standing flaky/manual AI tests under `tests/ai/**`
(`skipped.test.ts`, `bin.test.ts`, `service.test.ts`), or the pre-migration
`web-extractor.test.ts` "keep same id after resize" skip.

---

## 1. JSX automatic runtime dropped when the environment is set via a docblock

- **rstest issue:** _to be filed_ (regression introduced in `@rstest/core@0.11.1`).
- **Symptom:** `ReferenceError: React is not defined` at render time.
- **Root cause:** When a test file selects a non-default environment through a
  per-file docblock (`@rstest-environment jsdom` / `@vitest-environment jsdom`)
  while the config default is `node`, 0.11.1 compiles that file (and the modules
  it pulls in) through a pipeline that **omits the configured `pluginReact`**.
  JSX then falls back to the classic `React.createElement` runtime, which is
  undefined because the files rely on the automatic runtime (`import type React`
  or explicit `createElement` on a component whose own JSX is no longer
  transformed). Verified via A/B: `0.11.0` passes, `0.11.1` fails; setting the
  config default to `jsdom` (so the docblock no longer switches the env) also
  passes. Minimal repro kept out-of-tree.
- **Workaround:** whole-file `describe.skip(...)`.
- **Revert when:** 0.11.1 restores `pluginReact` for docblock-selected
  environments. Then remove the `describe.skip` + `TODO(rstest)` comment from
  each file below.

Affected files (all use a jsdom docblock + render React):

| File | Note |
| --- | --- |
| `apps/chrome-extension/tests/browser-extension-playground.test.tsx` | `.tsx`, JSX + `import type React` |
| `apps/chrome-extension/tests/playground-popup.test.tsx` | `.tsx`, JSX + `import type React` |
| `apps/studio/tests/model-env-config-modal.test.tsx` | `.tsx` |
| `apps/studio/tests/updater-section.test.tsx` | `.tsx` |
| `apps/studio/tests/main-content-web-navigation.test.tsx` | `.tsx` |
| `apps/studio/tests/studio-recorder-provider.test.tsx` | `.tsx` |
| `apps/studio/tests/shell-layout-recorder-overlay.test.tsx` | `.tsx` |
| `apps/studio/tests/playground-import-replay.test.tsx` | `.tsx` |
| `apps/studio/tests/studio-recorder-panel.test.tsx` | `.tsx` |
| `apps/studio/tests/sidebar-device-list.test.ts` | `.ts`, renders a `.tsx` component via `createElement` |
| `apps/studio/tests/studio-playground-ready-provider.test.ts` | `.ts`, renders a `.tsx` component via `createElement` |

---

## 2. Externalized / cross-package dependency mocks are not routed

- **rstest issue:** https://github.com/web-infra-dev/rstest/issues/1456
- **Symptom:** a mock configured in the test file is never seen by the
  system-under-test; the spy reports 0 calls.
- **Root cause:** when the SUT lives in another workspace package (consumed as a
  built `dist`) and reads a singleton from a shared package
  (e.g. `@midscene/core/utils` → `globalConfigManager` from
  `@midscene/shared/env`), rstest does not route that transitive dependency
  through this file's `rs.mock(...)`. The identical assertions pass in a focused
  test that mocks only the shared package.
- **Workaround:** `test.skip(...)` on the affected cases.
- **Revert when:** #1456 (externalized-dependency mock resolution) is fixed.

| File | Skipped cases |
| --- | --- |
| `packages/cli/tests/unit-test/create-yaml-player.test.ts` | 2 — legacy `MIDSCENE_CACHE` env cache (true / false). Equivalent coverage runs in `process-cache-config.test.ts`. |
| `packages/playground/tests/unit/server-interact.test.ts` | 1 — recorder keeps `aiDescribe` ready and writes annotated screenshots when verification fails. |

---

## 3. Variable (non-literal) dynamic imports cannot be mocked

- **rstest issue:** https://github.com/web-infra-dev/rstest/issues/1454
- **Symptom:** `rs.mock(...)` has no effect on a module loaded via
  `await import(variable)`; the real module runs (e.g. a real Electron process
  spawns, real proxy dispatchers are built).
- **Root cause:** rstest injects mocks through an rspack build-time transform. A
  dynamic `import(variable)` is not statically analyzable, so it escapes the
  transform and loads via Node's native ESM loader, bypassing the mock.
- **Workaround:** `it.skip(...)` where the SUT's dynamic import can't be made
  static; or, where possible, replace the runtime `await import(variable)` with a
  statically-analyzable string-literal import so the mock applies.
- **Revert when:** #1454 (mockable variable dynamic imports) is fixed.

| File | Workaround |
| --- | --- |
| `packages/core/tests/unit-test/proxy-configuration.test.ts` | 7 `it.skip` — HTTP/HTTPS/SOCKS proxy dispatcher construction. |
| `packages/ios/tests/unit-test/agent.test.ts` | 2 `it.skip` — override device class from option / from env. |
| `apps/studio/tests/launch-electron.test.ts` | code workaround — use a static string-literal import instead of `await import(relativeModulePath)` so `rs.mock('node:child_process')` applies. |

---

## 4. Native display dependency crashes the worker in headless CI

- **rstest issue:** none — this is an environment limitation, but it is listed
  here because the migration is what exposed it. Under vitest the worker crash
  was swallowed by `dangerouslyIgnoreUnhandledErrors: !!process.env.CI`; rstest
  has no such switch, so an uncatchable native crash fails the file (and, on
  `@rstest/core@0.11.1`, is now correctly reported as a failed test).
- **Symptom:** `Could not open main display` then
  `Worker exited unexpectedly (code=null, signal=SIGSEGV)`.
- **Root cause:** `@computer-use/libnut` calls X11 `XOpenDisplay` for
  screen/display queries; on a headless Linux runner there is no `DISPLAY`, and
  the native call segfaults — uncatchable from JS.
- **Workaround:** `it.skipIf(process.platform === 'linux' && !process.env.DISPLAY)`
  on the display-dependent cases. They still run locally and on any runner with
  a real display.
- **Revert when:** the CI runner provides a virtual display (e.g. `xvfb`) for
  the computer package, or libnut degrades gracefully without a display.

| File | Guarded cases |
| --- | --- |
| `packages/computer/tests/unit-test/device.test.ts` | 2 — `should list displays`, `should check computer environment`. |

---

## Note — coverage provider is `v8`, not `istanbul`

`scripts/rstest-coverage.ts` sets `provider: 'v8'` on purpose. **Do not switch
it back to `istanbul`.** Istanbul rewrites source to inject `cov_*()` counters;
when a function defined in an instrumented source file (e.g.
`src/puppeteer/base-page.ts`) is handed to Puppeteer's `page.evaluate`, it is
serialized and run in the browser context where `cov_*` does not exist, throwing
`ReferenceError: cov_… is not defined` (and skewing timing enough to break
race-sensitive tests). `v8` uses the runtime profiler and does not rewrite
source, matching the behavior these suites relied on under vitest. Requires the
`@rstest/coverage-v8` dev dependency.

---

## How to revert an entry

1. Confirm the referenced rstest fix is in the pinned `@rstest/core` version.
2. `grep -rn "TODO(rstest)"` and, for the fixed group, delete the marker plus
   its `describe.skip` / `test.skip` / `it.skip` (or restore the dynamic import).
3. Run the affected package's tests (`npx nx test <project>`) and confirm the
   un-skipped cases pass.
4. Remove the group from this file.
