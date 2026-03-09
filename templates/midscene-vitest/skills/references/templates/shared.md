---
title: Test Lifecycle & Shared Patterns
impact: CRITICAL
tags: lifecycle, report, assertions, shared
---

# Test Lifecycle & Shared Patterns

## Lifecycle (All Platforms)

All three platforms follow the same fixture-based lifecycle:

```typescript
const fixture = XxxTest.init(options?);  // beforeAll + afterEach + afterAll registered automatically

it('scenario', async (testCtx) => {
  const ctx = await fixture.create(targetUrl, testCtx);  // per-test context
  // ... test body ...
});
```

Where `Xxx` is `Web`, `Android`, or `IOS`.

Under the hood, `init()` registers these hooks:

| Hook | What happens |
|------|-------------|
| `beforeAll` | Initialize shared resource (browser / device) |
| each `it` | `fixture.create()` creates per-test context with fresh agent |
| `afterEach` | Collect test report, destroy context |
| `afterAll` | Merge reports + cleanup shared resource |

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
