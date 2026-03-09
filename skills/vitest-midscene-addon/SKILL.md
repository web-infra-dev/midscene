---
name: vitest-midscene-addon
description: "Enhances Vitest with Midscene for AI-powered UI testing across Web (Playwright), Android (ADB), and iOS (WDA). Scaffolds new projects, converts existing projects, and creates/updates/debugs/runs E2E tests using natural-language UI interactions. Triggers: write test, add test, create test, update test, fix test, debug test, run test, e2e test, midscene test, new project, convert project, init project, 写测试, 加测试, 创建测试, 更新测试, 修复测试, 调试测试, 运行测试, 新建工程, 转化工程."
user-invocable: true
argument-hint: "[create|update|run|init] <feature-name>"
---

# Vitest Midscene Addon

## Modules

| Module | Role |
|--------|------|
| **Vitest** | TypeScript test framework. Provides `describe`/`it`/`expect`/hooks for test organization, assertions, and lifecycle. |
| **Midscene** | AI-driven UI automation. Interacts with UI elements via natural language — no fragile selectors. Core APIs: `aiTap`, `aiInput`, `aiAssert`, `aiQuery`, `aiWaitFor`, `aiAct`. |

Supported platforms:

- **Web** — `WebTest` (Playwright Chromium): `ctx.agent` + `ctx.page`
- **Android** — `AndroidTest` (ADB + scrcpy): `ctx.agent` only
- **iOS** — `IOSTest` (WebDriverAgent): `ctx.agent` only

## Test Case Structure

```typescript
import { describe, expect, it } from 'vitest';
import { WebTest } from '../../src/context';

describe('百度搜索', () => {
  const fixture = WebTest.init();

  it('应该成功搜索', async (testCtx) => {
    const ctx = await fixture.create('https://baidu.com', testCtx);
    await ctx.agent.aiAct('在搜索框中输入"新年快乐"，然后点击百度一下');
    await ctx.page.waitForLoadState('networkidle');
    const title = await ctx.page.title();
    expect(title).toContain('新年快乐');
  });
});
```

Key patterns:
- `XxxTest.init(options?)` registers lifecycle hooks, returns a fixture
- `fixture.create(url, testCtx)` creates a per-test context with its own agent
- File location: `e2e/<platform>/<feature>.test.ts` (kebab-case filenames)
- One `describe` per feature, multiple `it` blocks for scenarios

## Task Routing

### Step 1: Detect project state

Read [detect.md](./references/detect.md) and determine the project state: **Empty**, **Existing**, or **Ready**.

### Step 2: Route by state + intent

| State | Action |
|-------|--------|
| **Empty** | Execute [phases/create.md](./references/phases/create.md) first. Once Ready, go to [phases/enhance.md](./references/phases/enhance.md) to handle the user's original intent |
| **Existing** | Execute [phases/transform.md](./references/phases/transform.md) first. Once Ready, go to [phases/enhance.md](./references/phases/enhance.md) to handle the user's original intent |
| **Ready** | Go directly to [phases/enhance.md](./references/phases/enhance.md) and follow its intent routing |

## References

### Phases

| Document | When to read |
|----------|-------------|
| [detect.md](./references/detect.md) | **Always** — first step of every task |
| [phases/create.md](./references/phases/create.md) | State is Empty |
| [phases/transform.md](./references/phases/transform.md) | State is Existing |
| [phases/enhance.md](./references/phases/enhance.md) | State is Ready |

### Specs & Patterns

| Document | Description |
|----------|-------------|
| [specs/project-spec.md](./references/specs/project-spec.md) | Standard project structure, config, and dependencies |
| [patterns/web.md](./references/patterns/web.md) | Web test pattern (lifecycle + scaffolding + tips) |
| [patterns/android.md](./references/patterns/android.md) | Android test pattern (lifecycle + scaffolding + tips) |
| [patterns/ios.md](./references/patterns/ios.md) | iOS test pattern (lifecycle + scaffolding + tips) |

### APIs & Guides

| Document | Impact | Description |
|----------|--------|-------------|
| [midscene-api.md](./references/apis/midscene-api.md) | **CRITICAL** | Midscene Agent API |
| [vitest-api.md](./references/apis/vitest-api.md) | MEDIUM | Vitest API |
| [playwright-api.md](./references/apis/playwright-api.md) | MEDIUM | Playwright Page API (Web only) |
| [test-case-operations.md](./references/test-case-operations.md) | HIGH | Test CRUD workflows and run commands |
| [troubleshooting.md](./references/troubleshooting.md) | HIGH | Common failure patterns and fixes |
