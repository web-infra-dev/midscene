---
title: Project State Detection
impact: CRITICAL
tags: detect, state, routing, prerequisite
---

# Project State Detection

Before executing any task, determine the project's current state by checking the rules below **from top to bottom**. The first state whose conditions are **all** satisfied is the current state.

---

## Ready

The project is fully set up and ready for test creation/modification.

**All** of the following must be true:

1. `src/context/base.ts` exists
2. `vitest.config.ts` exists and its `test.include` contains `e2e/**/*.test.ts`
3. `package.json` exists and lists `@midscene/core` in `dependencies` or `devDependencies`
4. At least one platform context file exists: `src/context/web.ts`, `src/context/android.ts`, or `src/context/ios.ts`

**How to check:**
- Use Glob to check file existence: `src/context/base.ts`, `vitest.config.ts`, `package.json`
- Read `vitest.config.ts` and verify `include` contains `e2e/**/*.test.ts`
- Read `package.json` and verify `@midscene/core` is listed

→ Route to **[phases/enhance.md](./phases/enhance.md)**

---

## Existing

A project exists but has not been set up for Midscene + Vitest E2E testing.

**Condition:** `package.json` exists, but one or more Ready conditions are not met.

→ Route to **[phases/transform.md](./phases/transform.md)**

---

## Empty

No project exists in the target directory.

**Condition:** `package.json` does not exist.

→ Route to **[phases/create.md](./phases/create.md)**

---

## After Phase Completion

After completing a Create or Transform phase, the project should satisfy all Ready conditions. Verify by re-checking the Ready rules above before proceeding to the user's original intent.
