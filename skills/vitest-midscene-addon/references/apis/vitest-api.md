---
title: Vitest API
impact: MEDIUM
tags: vitest, testing, assertions, hooks
---

# Vitest API

## Common APIs

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
```

| API | Description |
|-----|-------------|
| `describe(name, fn)` | Define a test suite |
| `it(name, fn)` / `test(name, fn)` | Define an individual test case |
| `expect(value)` | Create an assertion chain |
| `beforeAll(fn)` | Run once before all tests in the suite |
| `afterAll(fn)` | Run once after all tests in the suite |
| `beforeEach(fn)` | Run before each test |
| `afterEach(fn)` | Run after each test |

### Common Assertions

```typescript
expect(value).toBe(expected);           // strict equality
expect(value).toContain(substring);     // string/array contains
expect(value).toBeTruthy();             // truthy check
expect(value).toMatchObject(partial);   // partial object match
expect(fn).toThrow();                   // expect function to throw
```

## How to Look Up More

1. Official docs: https://vitest.dev/api/
2. In `node_modules/vitest`, find the type definitions for the API you need, read the signatures first
3. If types are not enough, follow the source references in the `.d.ts` files to read the implementation
