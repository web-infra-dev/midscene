---
title: "Phase: Transform"
impact: CRITICAL
tags: transform, convert, migrate, existing-project
---

# Phase: Transform

Add Midscene + Vitest E2E testing to an existing project without breaking what's already there.

**Precondition:** [detect.md](../detect.md) determined the state is **Existing**.
**Postcondition:** The project satisfies all **Ready** conditions in detect.md.

---

## Core Constraint: Non-Destructive

Every step follows the pattern: **Detect → Diff → Incremental Merge**.

- NEVER overwrite existing configuration — only add missing fields
- NEVER replace existing reporters/plugins — append to the existing array
- NEVER delete existing files or directories
- If uncertain about a merge, ask the user before proceeding

---

## Steps

### 1. Scan existing project

Before making any changes, gather information:

- **Package manager**: check for `package-lock.json` (npm), `yarn.lock` (yarn), `pnpm-lock.yaml` (pnpm), `bun.lockb` (bun)
- **Existing configs**: check for `vitest.config.ts`, `tsconfig.json`, `.env`
- **Existing dependencies**: read `package.json` for already-installed packages
- **Directory structure**: check if `src/`, `e2e/` directories exist and what they contain

### 2. Install missing dependencies

Compare `package.json` against [specs/project-spec.md — Dependencies](../specs/project-spec.md#dependencies).

- Only install packages that are NOT already listed
- Use the project's existing package manager (npm/yarn/pnpm/bun)

### 3. Merge vitest.config.ts

**If it does not exist:** Create it per [specs/project-spec.md](../specs/project-spec.md#vitestconfigts).

**If it already exists:** Read it and merge incrementally:

- `import 'dotenv/config'`: add at the top of the file if not already present
- `test.include`: append `'e2e/**/*.test.ts'` to the existing array if not already present
- `test.testTimeout`: set to `180_000` only if not already set or if the current value is lower
- `test.hookTimeout`: set to `60_000` only if not already set or if the current value is lower
- `test.reporters`: **append** `'./src/reporter.ts'` to the existing reporters array — do NOT replace

Example — merging into an existing config:

```typescript
// Before (user's existing config)
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    reporters: ['verbose'],
  },
});

// After (merged)
import 'dotenv/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'e2e/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    reporters: ['verbose', './src/reporter.ts'],
  },
});
```

### 4. Merge tsconfig.json

**If it does not exist:** Create it per [specs/project-spec.md](../specs/project-spec.md#tsconfigjson).

**If it already exists:** Only add missing entries to `include`:
- Add `"e2e"` if not present
- Add `"src"` if not present
- Add `"vitest.d.ts"` if not present
- Do NOT modify `compilerOptions` unless strictly required (e.g., missing `esModuleInterop`)

### 5. Add infrastructure code

Copy missing files from `boilerplate/src/` to the project's `src/`:

- If `src/context/` does not exist → copy the entire directory
- If `src/context/` exists → only copy missing files (base.ts, index.ts, platform files). If a file with the same name already exists, do NOT overwrite it — warn the user about the conflict
- If `src/report-helper.ts` does not exist → copy it
- If `src/reporter.ts` does not exist → copy it
- If `src/utils.ts` does not exist → copy it
- If `vitest.d.ts` does not exist at project root → copy it

### 6. Create e2e/ directories

- Create `e2e/<platform>/` for each requested platform if the directory doesn't exist
- Do NOT delete or modify existing files in e2e/

### 7. Set up .env

- If `.env` does not exist → create it per [specs/project-spec.md](../specs/project-spec.md#env)
- If `.env` exists → append missing Midscene variables only (see [specs/project-spec.md](../specs/project-spec.md#env) for the full list)

### 8. Migrate existing tests (optional)

If the user has existing E2E tests (Playwright, Cypress, etc.):

- **Ask the user** before migrating — do not auto-migrate
- Convert to the `fixture = XxxTest.init()` + `fixture.create()` pattern
- Replace selector-based interactions with Midscene AI methods
- Keep original files as backup until the user confirms

### 9. Verify Ready state

Re-check all **Ready** conditions in [detect.md](../detect.md). If any fail, fix before proceeding.

Run a quick verification:

```bash
npx vitest run e2e/<platform>/<first-test>.test.ts
```
