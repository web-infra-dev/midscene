---
title: Project Specification
impact: CRITICAL
tags: spec, structure, config, dependencies
---

# Project Specification

Defines what a **Ready** project looks like. Both Create and Transform phases use this as the alignment target.

The canonical reference implementation is in the `boilerplate/` directory of this skill.

---

## Directory Structure

```
<project>/
├── e2e/
│   └── <platform>/              # web/, android/, ios/ — one per platform
│       └── <feature>.test.ts    # kebab-case filenames
├── src/
│   ├── context/                 # Platform context classes
│   │   ├── index.ts             # Barrel exports
│   │   ├── base.ts              # BaseTestContext, TestFixture type
│   │   ├── web.ts               # WebTest (if Web platform)
│   │   ├── android.ts           # AndroidTest (if Android platform)
│   │   └── ios.ts               # IOSTest (if iOS platform)
│   ├── report-helper.ts         # Report collection and merging
│   ├── reporter.ts              # Custom Vitest reporter
│   └── utils.ts                 # Utilities
├── vitest.config.ts
├── vitest.d.ts
├── tsconfig.json
├── package.json
└── .env
```

Only include platform files (web.ts / android.ts / ios.ts) for the platforms the user needs.

---

## Dependencies

Use the project's package manager (npm / yarn / pnpm / bun). For Transform phase, detect from lock file; for Create phase, ask the user.

All packages are installed as `dependencies`:

- `@midscene/core`
- `@midscene/web`
- `@midscene/android`
- `@midscene/ios`
- `playwright`
- `vitest`
- `typescript`
- `dotenv`

---

## Configuration Files

All configuration files live in `boilerplate/` as the single source of truth. Read the boilerplate files directly when creating or merging configs.

### vitest.config.ts

**Source:** `boilerplate/vitest.config.ts`

Required fields in `test`:

| Field | Value | Purpose |
|-------|-------|---------|
| `include` | `['e2e/**/*.test.ts']` | Pick up E2E test files |
| `testTimeout` | `180_000` | AI-driven tests are slower than selector-based |
| `hookTimeout` | `60_000` | Teardown may wait for browser/device cleanup |
| `reporters` | `['./src/reporter.ts']` | Midscene report collection |

Top-level `import 'dotenv/config'` is required to load `.env` variables.

### tsconfig.json

**Source:** `boilerplate/tsconfig.json`

The `include` array must contain `"e2e"`, `"src"`, and `"vitest.d.ts"` at minimum.

### .env

**Source:** `boilerplate/.env.example`

Required variables:

| Variable | Purpose |
|----------|---------|
| `MIDSCENE_MODEL_BASE_URL` | AI model endpoint |
| `MIDSCENE_MODEL_API_KEY` | AI model API key |
| `MIDSCENE_MODEL_NAME` | Model name |
| `MIDSCENE_MODEL_FAMILY` | Model family |

Optional platform variables are documented in the `.env.example` file (Android ADB config, iOS WDA config).

### vitest.d.ts

**Source:** `boilerplate/vitest.d.ts`

Extends Vitest's `TaskMeta` interface with `midsceneReport` field for report merging.

### package.json scripts

**Source:** `boilerplate/package.json`

Required scripts: `test`, `test:web`, `test:android`, `test:ios`. See boilerplate for exact commands.

---

## Infrastructure Code

All files under `src/` should be copied from the `boilerplate/src/` directory of this skill. These files implement:

- **context/base.ts** — `BaseTestContext<TAgent>` base class + `TestFixture` type
- **context/web.ts** — `WebTest` (fixture pattern for Playwright)
- **context/android.ts** — `AndroidTest` (fixture pattern for ADB)
- **context/ios.ts** — `IOSTest` (fixture pattern for WDA)
- **context/index.ts** — Barrel exports
- **report-helper.ts** — `ReportHelper` class + `buildReportMeta()`
- **reporter.ts** — `MidsceneReporter` extending Vitest's `DefaultReporter`
- **utils.ts** — `generateTimestamp()`

Do NOT modify these files when copying. They are the canonical implementation.
