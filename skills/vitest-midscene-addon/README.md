# Vitest Midscene Addon

Enhance Vitest with [Midscene](https://midscenejs.com) for smarter, easier UI testing. AI-driven E2E tests across **Web**, **Android**, and **iOS** — write interactions in natural language, no selectors needed.

## What This Skill Does

- **Scaffold new projects** — generate a complete Vitest + Midscene project from scratch
- **Convert existing projects** — add Midscene to an existing Vitest/Playwright setup
- **Create & update tests** — generate E2E test files from feature descriptions
- **Debug failures** — diagnose test errors and suggest fixes
- **Run tests** — execute tests across platforms

## Install

Install the skill for your AI coding tool:

```bash
bash install.sh              # All tools
bash install.sh claude       # Claude Code only
bash install.sh trae         # Trae only
bash install.sh codex        # Codex only
```

## Usage

After installing, invoke the skill:

| Tool | Command |
|------|---------|
| Claude Code | `/vitest-midscene-addon create login` or `/vma create login` |
| Trae | reference `#vitest-midscene-addon` in chat |
| Codex | `/skills` or `$vitest-midscene-addon` in prompt |

Example tasks:
- "Create a web E2E test for the login page"
- "Add an Android test for the todo app"
- "Fix the timeout error in baidu-search.test.ts"
- "Set up a new Midscene project for iOS"

## Boilerplate

The `boilerplate/` directory is the canonical reference implementation. The skill references it when scaffolding new projects. You can also copy it directly:

```bash
cp -r boilerplate/ my-e2e-project/
cd my-e2e-project
npm install              # or yarn / pnpm / bun
cp .env.example .env     # Fill in your AI model API keys
npm test
```

## Supported Platforms

| Platform | Context Class | Agent Type | Automation |
|----------|--------------|------------|------------|
| Web | `WebTest` | `PlaywrightAgent` | Playwright Chromium |
| Android | `AndroidTest` | `AndroidAgent` | ADB + scrcpy |
| iOS | `IOSTest` | `IOSAgent` | WebDriverAgent |

## Links

- [Midscene Documentation](https://midscenejs.com)
- [Midscene API Reference](https://midscenejs.com/api.html)
- [Vitest Documentation](https://vitest.dev)
