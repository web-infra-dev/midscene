---
name: midscene-vitest
description: "AI-driven E2E test generation and management with Midscene + Vitest across Web (Playwright), Android (ADB), and iOS (WDA). Use when user asks to create, update, debug, or run E2E test files. Triggers: write test, add test, create test, update test, fix test, debug test, run test, e2e test, midscene test, 写测试, 加测试, 创建测试, 更新测试, 修复测试, 调试测试, 运行测试."
user-invokable: true
argument-hint: "[create|update|run] <feature-name>"
---

# Midscene E2E Test Skill

You are an expert at writing AI-driven E2E tests using **Midscene + Vitest** across **Web**, **Android**, and **iOS** platforms. Follow this guide and referenced documents to create, update, and run tests.

## Project Conventions

- Test files: `e2e/<platform>/<feature>.test.ts` (e.g., `e2e/web/login.test.ts`, `e2e/android/checkout.test.ts`, `e2e/ios/safari.test.ts`)
- Naming: use kebab-case for filenames, descriptive Chinese or English for `describe`/`it` blocks
- One `describe` per feature, multiple `it` blocks for scenarios
- All browser/device/agent initialization goes through context classes — never instantiate directly in test files:
  - **Web**: `WebTestContext` from `src/context` (Playwright chromium)
  - **Android**: `AndroidTestContext` from `src/context` (ADB + scrcpy)
  - **iOS**: `IOSTestContext` from `src/context` (WebDriverAgent)
- All platforms follow the same lifecycle: `setup()` → `create()` → `collectReport()` → `mergeAndTeardown()`
- Each `it` block gets its own agent and report file — reports are auto-merged with pass/failed/skipped status
- Environment variables in `.env` (copy from `.env.example`)

## References

### APIs

| Document | Impact | Description |
|----------|--------|-------------|
| [midscene-api.md](./references/apis/midscene-api.md) | **CRITICAL** | Midscene Agent API — shared AI methods + platform-specific methods (Android/iOS) |
| [vitest-api.md](./references/apis/vitest-api.md) | MEDIUM | Vitest API — `describe`/`it`/`expect`/hooks |
| [playwright-api.md](./references/apis/playwright-api.md) | MEDIUM | Playwright Page API — `ctx.page` methods (Web only) |

### Templates

| Document | Impact | Description |
|----------|--------|-------------|
| [shared.md](./references/templates/shared.md) | **CRITICAL** | Lifecycle, report merging, common assertions (all platforms) |
| [web.md](./references/templates/web.md) | **CRITICAL** | Web scaffolding template + setup options |
| [android.md](./references/templates/android.md) | **CRITICAL** | Android scaffolding template + setup options |
| [ios.md](./references/templates/ios.md) | **CRITICAL** | iOS scaffolding template + setup options |

### Guides

| Document | Impact | Description |
|----------|--------|-------------|
| [test-case-operations.md](./references/test-case-operations.md) | HIGH | Test case operations: create / update / delete workflows, run commands |
| [troubleshooting.md](./references/troubleshooting.md) | HIGH | Timeout errors, element not found, network waiting, headed mode |
