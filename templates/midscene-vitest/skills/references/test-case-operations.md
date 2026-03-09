---
title: Test Case Operations
impact: HIGH
tags: crud, workflow, create, update, delete, run
---

# Test Case Operations: Create / Update / Delete

This guide describes how to operate on E2E test files in the `e2e/` directory. Each section is a standalone workflow — jump directly to the one you need.

---

## Create a New Test File

When the user wants to test a new feature or page.

1. Confirm the **platform** (web / android / ios), **feature name**, and **target URL or app** with the user
2. Create test file in the appropriate platform directory:
   - Web: `e2e/web/<feature>.test.ts`
   - Android: `e2e/android/<feature>.test.ts`
   - iOS: `e2e/ios/<feature>.test.ts`
3. Scaffold using the matching platform template:
   - Web: [templates/web.md](./templates/web.md)
   - Android: [templates/android.md](./templates/android.md)
   - iOS: [templates/ios.md](./templates/ios.md)
4. Import the correct context class from `../../src/context`:
   - `WebTest` for Web
   - `AndroidTest` for Android
   - `IOSTest` for iOS
5. Fill in `describe` name, `it` blocks, and Midscene API calls per user requirements
6. Run and verify:
   ```bash
   npx vitest run e2e/<platform>/<feature>.test.ts
   ```

---

## Update an Existing Test File

When the user wants to add scenarios, fix broken locators, or change assertions.

### Add new scenarios

1. Read the existing test file, understand current `describe`/`it` structure
2. Add new `it` blocks inside the existing `describe`
3. Each `it` block should call `fixture.create()` to get its own independent context

### Fix a failing test

1. Read the test file and the error message
2. Identify the root cause: wrong locator description, missing wait, incorrect assertion
3. Make targeted fix — do not rewrite the entire file
4. See [troubleshooting.md](./troubleshooting.md) for common failure patterns

### Modify assertions or interactions

1. Read the test file, locate the `it` block to change
2. Update only the affected lines (locator text, assertion condition, input value, etc.)

After any update, always run the test to verify:
```bash
npx vitest run e2e/<platform>/<feature>.test.ts
```

---

## Delete a Test File

When a test is no longer needed.

1. Confirm with the user before deleting
2. Remove the file: `e2e/<platform>/<feature>.test.ts`
3. Run `npx vitest run` to ensure remaining tests are not affected

---

## Run Tests

```bash
npx vitest run                                    # Run all tests (all platforms)
npm run test:web                                  # Run Web tests only
npm run test:android                              # Run Android tests only
npm run test:ios                                  # Run iOS tests only
npx vitest run e2e/<platform>/<feature>.test.ts   # Run a specific test
npx vitest                                        # Watch mode
npx vitest --ui                                   # With Vitest UI
```

### Interpreting Results

- **PASS**: Test succeeded
- **FAIL**: Check the error message — common causes:
  - AI could not locate the element -> improve the natural language description
  - Timeout -> page may not have loaded, add `waitForLoadState` (Web) or increase `launchDelay` (mobile)
  - Assertion failed -> verify the expected condition matches actual page/device state
- **Timeout**: Default test timeout is 180s. For slow pages/apps, add explicit waits or use `aiWaitFor`
