# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Core Development Commands

```bash
# Install dependencies (requires Node.js 18.19.0+ and pnpm 9.3.0+)
pnpm install

# Build all packages
pnpm run build

# Run development mode (watches and builds most packages)
pnpm run dev

# Lint the codebase using Biome
pnpm run lint

# Run unit tests
pnpm run test

# Run AI-related tests (requires API keys)
pnpm run test:ai

# Run end-to-end tests
pnpm run e2e

# Run all tests including AI and E2E tests
pnpm run test:ai:all

# Create standardized commit messages
pnpm run commit
```

### AI Feature Development

To work with AI-related features, create a `.env` file in the root directory:

```
OPENAI_API_KEY="your_token"
MIDSCENE_MODEL_NAME="gpt-4o-2024-08-06"
```

### Package-Specific Commands

```bash
# Build a specific package using nx
npx nx build @midscene/web

# Run tests for a specific package
npx nx test @midscene/web

# Run AI-related tests for a specific package
npx nx test:ai @midscene/web

# Run end-to-end tests for web package
npx nx e2e @midscene/web

# Run Android-specific E2E tests (requires ADB setup)
cd packages/web-integration && pnpm run test:ai -- adb
```

### Chrome Extension Development

```bash
# Start Chrome extension development
cd apps/chrome-extension
pnpm run dev

# Build the Chrome extension
cd apps/chrome-extension
pnpm run build
```

## Project Architecture

Midscene.js is an AI-powered automation framework that enables AI to operate web and Android interfaces using natural language instructions. The project is structured as a monorepo using pnpm workspaces.

### Core Packages

- **@midscene/core**: Core functionality for AI-powered automation
  - Handles AI model integration (GPT-4o, UI-TARS, Qwen2.5-VL)
  - Processes natural language instructions
  - Manages AI-based decision making

- **@midscene/web**: Web browser automation
  - Integrates with Puppeteer and Playwright
  - Provides browser control functionality
  - Handles screenshot capture and DOM interaction

- **@midscene/android**: Android automation
  - ADB integration for device control
  - Screen capture and interaction
  - App management capabilities

- **@midscene/visualizer**: Visualization components
  - Renders test reports
  - Provides playback of recorded sessions
  - Visualization of automation execution

- **@midscene/mcp**: Model Context Protocol integration
  - Allows other MCP clients to use Midscene capabilities
  - Standardizes communication with AI models

### Frontend Applications

- **android-playground**: UI for controlling Android devices
- **chrome-extension**: Chrome DevTools extension
  - Browser automation interface
  - Event recording system
  - Bridge mode for external control
  - Playground for testing commands
- **record-form**: Form for recording UI events
- **report**: Viewer for automation reports
- **site**: Documentation website

## Key Features

1. **Natural Language Interaction**: Use plain English to describe automation tasks
2. **UI Automation**:
   - **Web Automation**: Works with Puppeteer and Playwright
   - **Android Automation**: Works with ADB
3. **MCP Integration**: Standardized model interaction protocol
4. **Visual Reports**: Debug and understand automation execution
5. **Caching**: Improve performance for repeated tasks
6. **Model Support**: 
   - GPT-4o (default)
   - UI-TARS (open-source)
   - Qwen2.5-VL (open-source)

## Development Workflow

1. The project uses [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
2. Every commit must include a scope (workflow, llm, playwright, puppeteer, mcp, bridge, etc.)
3. The project uses Biome for linting and formatting
4. Tests are run with Vitest (unit) and Playwright (E2E)
5. Changes should include appropriate tests when possible

## Chrome Extension Structure

The Chrome extension provides tools for browser automation, event recording, and a playground testing environment:

1. **Popup Interface**: Main extension UI with three tabs:
   - Playground: For testing browser automation commands
   - Record: For recording browser interactions
   - Bridge Mode: For connecting to external automation tools

2. **Record System**: Captures user interactions:
   - Records clicks, scrolls, inputs, navigation, viewport changes
   - Enhances events with AI-generated element descriptions

3. **Bridge Mode**: Allows external control of the browser
   - Creates communication channel between external tools and browser
   - Useful for hybrid automation (scripts + manual interaction)

The extension is built using RSBuild and uses Zustand for state management.