---
title: Test Lifecycle & Shared Patterns
impact: CRITICAL
tags: lifecycle, report, assertions, shared
---

# Test Lifecycle & Shared Patterns

## Lifecycle (All Platforms)

All three platforms follow the same lifecycle:

| Hook | Method | Purpose |
|------|--------|---------|
| `beforeAll` | `XxxTestContext.setup(options?)` | Initialize shared resource (browser / device) |
| each `it` | `ctx = await XxxTestContext.create(targetUrl/targetUri, testCtx)` | Create per-test context |
| `afterEach` | `XxxTestContext.collectReport(ctx, testCtx)` | Collect test report |
| `afterAll` | `XxxTestContext.mergeAndTeardown(suite, name?)` | Merge reports + cleanup |

Where `Xxx` is `Web`, `Android`, or `IOS`.

## Report Merging

All contexts manage `ReportHelper` internally:
- `collectReport` — called in `afterEach`, destroys context and appends test result
- `mergeAndTeardown` — called in `afterAll`, detects skipped tests from the suite, merges all reports, tears down shared resource

Key fields tracked per test:
- `testStatus` — `'passed'` | `'failed'` | `'timedOut'` | `'skipped'` | `'interrupted'`
- `testTitle` — test name from `it('name', ...)`
- `testDuration` — elapsed milliseconds (from `create()` to `afterEach`)
- `testId` — unique test identifier

## Common Assertions

```typescript
expect(value).toBe(expected);           // strict equality
expect(value).toContain(substring);     // string/array contains
expect(value).toBeTruthy();             // truthy check
expect(value).toMatchObject(partial);   // partial object match
```

## Platform Templates

- [Web Template](./web.md)
- [Android Template](./android.md)
- [iOS Template](./ios.md)
