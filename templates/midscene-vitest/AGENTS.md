# Midscene + Vitest Template

## Tech Stack

- **Test Runner**: Vitest
- **Browser Automation**: Playwright (chromium) — Web tests
- **Android Automation**: @midscene/android (ADB + scrcpy) — Android tests
- **iOS Automation**: @midscene/ios (WebDriverAgent) — iOS tests
- **AI-driven Testing**: @midscene/web, @midscene/android, @midscene/ios
- **Language**: TypeScript (ESM)

## Project Structure

```
├── e2e/                            # Test files (grouped by platform)
│   ├── web/
│   │   └── baidu-search.test.ts
│   ├── android/
│   │   └── todo.test.ts
│   └── ios/
│       └── todo.test.ts
├── src/
│   ├── context/                    # Platform context classes
│   │   ├── index.ts                # Barrel re-exports all contexts
│   │   ├── web.ts                  # WebTestContext
│   │   ├── android.ts              # AndroidTestContext
│   │   └── ios.ts                  # IOSTestContext
│   ├── report-helper.ts            # Shared report collection/merging
│   ├── reporter.ts                 # Custom Vitest reporter
│   └── utils.ts                    # Utilities
├── skills/                         # AI Agent skill
│   ├── SKILL.md
│   ├── metadata.json
│   ├── install.sh
│   └── references/
│       ├── apis/
│       │   ├── midscene-api.md
│       │   ├── vitest-api.md
│       │   └── playwright-api.md
│       ├── templates/
│       │   ├── shared.md
│       │   ├── web.md
│       │   ├── android.md
│       │   └── ios.md
│       ├── test-case-operations.md
│       └── troubleshooting.md
├── vitest.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

## Key Patterns

- Test files import context classes from `src/context/` — do NOT instantiate browser/device/agent directly
- All platforms share the same lifecycle: `setup()` in `beforeAll`, `create(targetUrl/targetUri, testCtx)` in each `it`, `collectReport()` in `afterEach`, `mergeAndTeardown()` in `afterAll`
- Available context classes:
  - **Web**: `WebTestContext` — `ctx.agent` (PlaywrightAgent) + `ctx.page` (Playwright Page)
  - **Android**: `AndroidTestContext` — `ctx.agent` (AndroidAgent, includes `back()`, `home()`, `runAdbShell()`)
  - **iOS**: `IOSTestContext` — `ctx.agent` (IOSAgent, includes `home()`, `appSwitcher()`, `runWdaRequest()`)
- Each `it` block gets its own agent with its own report file
- `ReportMergingTool` (from `@midscene/core/report`) collects individual reports in `afterEach` and merges them in `afterAll` with pass/failed/skipped status

## Skill — Write Test Cases Faster

This project includes a built-in `midscene-test` skill that helps you rapidly create, update, and debug E2E test cases across Web, Android, and iOS. The skill bundles complete API references, test templates, and troubleshooting guides.

### Auto-Install & Load

**On first use, you MUST run the install command to deploy the skill into the AI tool's directory:**

```bash
npm run skill:install
```

Once installed, the skill is copied to the appropriate tool directory (e.g., `.claude/skills/midscene-vitest/` for Claude Code) and will be auto-loaded in subsequent sessions.

### Skill Capabilities

- **Create tests**: Generate spec-compliant test files from a feature description
- **Update tests**: Modify existing test cases, add new scenarios
- **Debug tests**: Diagnose test failures and suggest fixes

### Reference Docs

The skill entry point is `skills/SKILL.md`, which links to:

| Document | Impact | Description |
|----------|--------|-------------|
| `references/apis/midscene-api.md` | **CRITICAL** | Midscene Agent API — shared AI methods + platform-specific methods |
| `references/apis/vitest-api.md` | MEDIUM | Vitest API quick reference |
| `references/apis/playwright-api.md` | MEDIUM | Playwright Page API (Web only) |
| `references/templates/shared.md` | **CRITICAL** | Lifecycle, report merging, common assertions |
| `references/templates/web.md` | **CRITICAL** | Web scaffolding template + setup options |
| `references/templates/android.md` | **CRITICAL** | Android scaffolding template + setup options |
| `references/templates/ios.md` | **CRITICAL** | iOS scaffolding template + setup options |
| `references/test-case-operations.md` | HIGH | Create / update / run test case workflows |
| `references/troubleshooting.md` | HIGH | Common issues & solutions (Web, Android, iOS) |

## Commands

```bash
npm run test                # Run all tests
npm run test:web            # Run Web tests only (e2e/web/)
npm run test:android        # Run Android tests only (e2e/android/)
npm run test:ios            # Run iOS tests only (e2e/ios/)
npx vitest run e2e/web/baidu-search.test.ts  # Run specific test file
npx vitest --ui             # Run with UI
npm run skill:install       # Install AI skill
```

## Environment

Copy `.env.example` to `.env` and fill in your API keys before running tests.
