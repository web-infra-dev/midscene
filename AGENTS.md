# AGENTS.md

This file is the canonical agent instruction file for this repository.
Use it as the single source of truth for OpenAI-, Anthropic-, and other
coding agents.

## Project Overview

Midscene.js is a visual-driven AI automation framework for Web, Android, and iOS. It uses visual language models (VLMs) like Qwen3-VL, UI-TARS, and Gemini to understand and interact with user interfaces through screenshots, without requiring DOM markup or semantic selectors.

## High-Value Rules

- Before creating a commit or opening/updating a PR, run `pnpm run lint`
  from the repository root.
- For user-facing documentation changes, update both English and Chinese
  copies in the same change.
- Common documentation pairs are `README.md` and `README.zh.md`, plus
  `apps/site/docs/en/**` and `apps/site/docs/zh/**`.
- For docs site changes, check `apps/site/agents.md` for additional
  translation rules before editing copy.

## Build System & Tooling

### Package Manager
- **pnpm 9.3.0+** is required (not npm or yarn)
- Enable with `corepack enable` before `pnpm install`

### Build System
- Uses **Nx 21.1.2** for monorepo task orchestration
- Uses **Rslib** for package bundling (Rsbuild for apps)
- All packages have build dependencies managed by Nx

### Common Commands

```bash
# Install dependencies (runs prepare script which builds all packages)
pnpm install

# Build all packages
pnpm run build

# Build without Nx cache (fixes circular dependency issues)
pnpm run build:skip-cache

# Build specific package
npx nx build @midscene/web
npx nx build @midscene/core

# Development mode (watch mode for most packages)
pnpm run dev

# Lint & format
pnpm run lint              # Biome linter with auto-fix
npx biome check . --fix    # Direct Biome usage

# Run unit tests
pnpm run test              # All non-AI tests
pnpm run test:ai           # AI-dependent tests (requires .env)
npx nx test @midscene/web  # Single package tests
npx nx test:ai @midscene/web

# Run E2E tests
pnpm run e2e               # Playwright E2E tests
pnpm run e2e:cache         # E2E with caching enabled
pnpm run e2e:report        # E2E with report generation
npx nx e2e @midscene/web   # Single package E2E
```

### Running Single Tests

```bash
# Run specific test file
npx nx test @midscene/core -- path/to/test.test.ts

# Run specific Playwright test
npx playwright test --config=tests/playwright.config.ts specific-test.spec.ts

# Run with AI features (needs .env)
AITEST=true npx nx test @midscene/core -- tests/ai/specific.test.ts
```

## Repository Structure

### Monorepo Layout

```
midscene/
├── packages/          # Core libraries
│   ├── core/         # Core AI agent, task execution, LLM integration
│   ├── web-integration/  # Playwright/Puppeteer integrations (@midscene/web)
│   ├── android/      # Android automation via ADB
│   ├── ios/          # iOS automation via WebDriverAgent
│   ├── mcp/          # Model Context Protocol server
│   ├── shared/       # Shared utilities and types
│   ├── visualizer/   # Report visualization components
│   ├── playground/   # Interactive playground server
│   └── recorder/     # Action recording utilities
└── apps/             # Applications
    ├── chrome-extension/  # Browser DevTools extension
    ├── site/         # Documentation website
    ├── report/       # Report viewer app
    ├── playground/   # Standalone playground app
    ├── android-playground/
    └── recorder-form/
```

### Key Architecture Concepts

**Agent System** (`packages/core/src/agent/`):
- `Agent`: Main interface for AI-driven automation
- `TaskExecutor`: Executes individual tasks (locate, extract, assert, action)
- `ExecutionSession`: Manages task context and caching
- Tasks are cached to improve performance and reduce API costs

**AI Model Integration** (`packages/core/src/ai-model/`):
- Supports multiple VLM providers (OpenAI-compatible APIs, UI-TARS, Qwen)
- `llm-planning.ts`: LLM-based planning and action generation
- `ui-tars-planning.ts`: UI-TARS model-specific planning
- `inspect.ts`: Visual element inspection and data extraction
- `prompt/`: Prompt templates for different models and tasks

**Device Abstraction** (`packages/core/src/device/`):
- Unified interface for web, Android, iOS interactions
- Each platform implements device-specific screenshot, tap, input methods

**Platform Integrations**:
- `@midscene/web`: Playwright and Puppeteer integrations, bridge mode for desktop Chrome
- `@midscene/android`: ADB-based Android automation
- `@midscene/ios`: WebDriverAgent-based iOS automation
- `@midscene/mcp`: MCP server exposing Midscene capabilities to AI assistants

## Configuration

### Environment Variables (.env)

Required for AI-related tests and features:

```bash
# For official models
OPENAI_API_KEY="your_api_key"
MIDSCENE_MODEL_NAME="qwen3-vl-plus"  # or gemini-2.5-pro, etc.

# For custom OpenAI-compatible endpoints
OPENAI_BASE_URL="https://your-endpoint.com"
MIDSCENE_OPENAI_INIT_CONFIG_JSON='{"baseURL":"...","defaultHeaders":{...}}'
```

Create `.env` in the repository root before running AI tests.

### Code Quality

- **Linter**: Biome (configured in `biome.json`)
- **Formatter**: Biome with 80 char line width, 2-space indent, single quotes
- **TypeScript**: Strict mode, target ES2018 minimum
- Pre-commit hooks enforce linting via lint-staged

## Testing

### Test Structure

- Unit tests: `packages/*/tests/unit-test/*.test.ts` (Vitest)
- AI tests: `packages/*/tests/ai/**/*.test.ts` (require .env, use `AITEST=true` or `test:ai`)
- E2E tests: `packages/*/tests/*.spec.ts` (Playwright)

### Test Environment Variables

- `AITEST=true`: Enable AI model calls in tests
- `MIDSCENE_CACHE=true`: Use cached responses (faster, no API calls)
- `MIDSCENE_REPORT=true`: Generate visual reports

### Running Tests

Before commit or PR, the minimum required validation is:

```bash
pnpm run lint
```

For code changes, also run the smallest relevant test target. AI tests are
slow and cost money, so use caching during development:

```bash
# Fast feedback loop
pnpm run test              # Non-AI tests only

# Full AI validation
pnpm run test:ai           # Requires .env, makes API calls
pnpm run e2e:cache         # Uses cache, no API calls
```

## Common Development Tasks

### Adding a New Feature

1. Identify the correct package (`@midscene/core`, `@midscene/web`, etc.)
2. Build all dependencies first: `pnpm run build`
3. Run package in watch mode: `cd packages/[name] && pnpm run dev`
4. Write tests in `tests/` directory
5. Ensure tests pass: `npx nx test @midscene/[name]`
6. Run linter: `pnpm run lint`

### Fixing Build Issues

If you see `REPLACE_ME_WITH_REPORT_HTML` or circular dependency errors:

```bash
pnpm run build:skip-cache
```

This rebuilds everything without Nx cache and resolves most circular dependency issues.

### Debugging AI Tests

1. Check `.env` file exists and has valid credentials
2. Run with cache first: `MIDSCENE_CACHE=true npx nx test:ai @midscene/core`
3. Use `DEBUG=midscene:*` for verbose logging
4. Enable reports: `MIDSCENE_REPORT=true` to see visual execution

### Working with Chrome Extension

```bash
cd apps/chrome-extension
pnpm run build
# Load dist/ folder in chrome://extensions (developer mode)
```

## Commit Guidelines

**All commits must follow Conventional Commits with mandatory scopes.**

Format: `<type>(<scope>): <subject>`

**Types**: `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `test`, `ci`, `build`

**Required Scopes** (must use one):
- Package names: `core`, `web-integration`, `android`, `ios`, `mcp`, `shared`, `visualizer`, `cli`, `playground`, `recorder`, `evaluation`
- App names: `chrome-extension`, `site`, `report`, `android-playground`, `recorder-form`, `ios-playground`
- Cross-cutting: `workflow`, `llm`, `playwright`, `puppeteer`, `bridge`

**Examples**:
- `feat(mcp): add screenshot tool with element selection`
- `fix(android): correct adb connection issue`
- `refactor(core): simplify agent task execution`
- `chore(workflow): update commitlint config`

Pre-commit hooks will reject non-compliant commits.

## Important Notes

- **Never disable tests** - fix them instead
- **Never use `--no-verify`** to bypass hooks
- **Always build before testing** - many packages depend on built artifacts
- **Use pnpm** - npm/yarn will not work correctly
- **Node 18.19.0+** required
- **Nx manages build order** - use `npx nx` commands to respect dependencies
- **AI tests are expensive** - use caching during development
