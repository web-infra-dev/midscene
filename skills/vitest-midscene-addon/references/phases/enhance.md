---
title: "Phase: Enhance"
impact: CRITICAL
tags: enhance, test, crud, debug, run
---

# Phase: Enhance

Operate on a project that is already set up and ready for E2E testing.

**Precondition:** [detect.md](../detect.md) determined the state is **Ready**.

---

## Route by User Intent

| User intent | Action | Documents to read |
|-------------|--------|-------------------|
| **Create a test file** | Generate new test | See [Creating a Test File](#creating-a-test-file) below |
| **Update or fix a test** | Modify existing test | [test-case-operations.md](../test-case-operations.md) → [troubleshooting.md](../troubleshooting.md) |
| **Debug a failure** | Diagnose and fix | [troubleshooting.md](../troubleshooting.md) → [midscene-api.md](../apis/midscene-api.md) |
| **Run tests** | Execute tests | [test-case-operations.md](../test-case-operations.md) (Run Tests section) |
| **Add a new platform** | Extend project | See [Adding a New Platform](#adding-a-new-platform) below |
| **Understand lifecycle / reports** | Learn internals | Platform pattern file: [web](../patterns/web.md) / [android](../patterns/android.md) / [ios](../patterns/ios.md) (Lifecycle section) |

Additional references available as needed: [vitest-api.md](../apis/vitest-api.md), [playwright-api.md](../apis/playwright-api.md) (Web only).

---

## Creating a Test File

1. **Check platform availability**: Verify the target platform's context file exists in `src/context/` (e.g., `web.ts`, `android.ts`, `ios.ts`). If not, follow [Adding a New Platform](#adding-a-new-platform) first.
2. Once the platform is available, follow [test-case-operations.md](../test-case-operations.md) for the creation workflow
3. Use the matching platform pattern: [web](../patterns/web.md) / [android](../patterns/android.md) / [ios](../patterns/ios.md)
4. Reference [midscene-api.md](../apis/midscene-api.md) for AI method usage

---

## Adding a New Platform

When the project is Ready but the user wants to add a platform that wasn't included initially:

1. Copy the platform's context file from `boilerplate/src/context/` (e.g., `android.ts`)
2. Add the export to `src/context/index.ts`
3. Create the `e2e/<platform>/` directory
4. Create the first test file using the platform pattern
