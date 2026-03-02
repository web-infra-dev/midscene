# Midscene + Vitest Template

A template project demonstrating how to use **Midscene + Vitest** for AI-driven E2E testing across **Web**, **Android**, and **iOS**. Write tests in natural language — no selectors needed.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in your model API key

# 3. Install AI skill (supports Claude Code, Trae, Codex)
npm run skill:install

# 4. Run tests
npm test              # All platforms
npm run test:web      # Web only
npm run test:android  # Android only
npm run test:ios      # iOS only
```

## Install Skill

The template ships with a `midscene-test` skill that guides AI agents to generate and manage E2E tests. Install it for your AI coding tool:

```bash
npm run skill:install          # Install for all tools
npm run skill:install:claude   # Claude Code only
npm run skill:install:trae     # Trae only
npm run skill:install:codex    # Codex only
```

After installation, invoke the skill via:
- **Claude Code**: `/midscene-test create login`
- **Trae**: reference `#midscene-test` in chat
- **Codex**: `/skills` or `$midscene-test` in prompt

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
│   ├── SKILL.md                    # Skill entry point
│   ├── metadata.json
│   ├── install.sh
│   └── references/                 # API & guide references
├── vitest.config.ts
├── tsconfig.json
├── .env.example
└── package.json
```

## How It Works

All three platforms follow the same test lifecycle:

```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { WebTestContext } from '../../src/context';

describe('My Feature', () => {
  let ctx: WebTestContext;

  beforeAll(() => WebTestContext.setup());
  afterEach((testCtx) => WebTestContext.collectReport(ctx, testCtx));
  afterAll((suite) => WebTestContext.mergeAndTeardown(suite));

  it('should do something', async (testCtx) => {
    ctx = await WebTestContext.create('https://example.com', testCtx);
    await ctx.agent.aiAct('click the Login button');
    await ctx.agent.aiAssert('login form is visible');
  });
});
```

Replace `WebTestContext` with `AndroidTestContext` or `IOSTestContext` for mobile tests.

## Context Classes

| Class | Platform | `ctx.agent` | `ctx.page` |
|-------|----------|-------------|------------|
| `WebTestContext` | Web (Playwright) | `PlaywrightAgent` | Playwright `Page` |
| `AndroidTestContext` | Android (ADB) | `AndroidAgent` | N/A |
| `IOSTestContext` | iOS (WDA) | `IOSAgent` | N/A |

All agents share AI methods: `aiTap`, `aiInput`, `aiAssert`, `aiQuery`, `aiWaitFor`, `aiAct`.

### Platform-Specific Agent Methods

**Android**: `agent.back()`, `agent.home()`, `agent.recentApps()`, `agent.launch(uri)`, `agent.runAdbShell(cmd)`

**iOS**: `agent.home()`, `agent.appSwitcher()`, `agent.launch(uri)`, `agent.runWdaRequest(req)`

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MIDSCENE_MODEL_API_KEY` | API key for the AI model |
| `MIDSCENE_MODEL_NAME` | Model name (optional) |
| `MIDSCENE_MODEL_BASE_URL` | Base URL (optional, for custom endpoints) |
| `MIDSCENE_MODEL_FAMILY` | Model family (optional) |

## Scripts

```bash
npm test                       # Run all tests
npm run test:web               # Run Web tests only
npm run test:android           # Run Android tests only
npm run test:ios               # Run iOS tests only
npm run test:ui                # Run with Vitest UI
npm run skill:install          # Install AI skill for all tools
```
