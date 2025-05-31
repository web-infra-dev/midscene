# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development Commands

```bash
# Install dependencies (run from project root)
pnpm install

# Build all packages in the project root
pnpm run build

# Start the project in development mode
cd apps/chrome-extension
pnpm run dev

# Build the Chrome extension
cd apps/chrome-extension
pnpm run build

# Package the extension into a zip file
cd apps/chrome-extension
pnpm run pack-extension
```

## High-Level Architecture

The Midscene Chrome Extension is a browser extension that provides tools for browser automation, event recording, and a playground testing environment. It consists of several key components:

### Core Components

1. **Popup Interface**: The main extension UI that appears when clicking the extension icon, containing three main tabs:
   - Playground: For testing browser automation commands
   - Record: For recording browser interactions and events
   - Bridge Mode: For connecting to external automation tools

2. **Record System**: A sophisticated event recording system that captures user interactions:
   - Records clicks, scrolls, inputs, navigation, viewport changes
   - Enhances events with AI-generated element descriptions
   - Organizes events into recording sessions
   - Supports exporting and replaying event sequences

3. **Bridge Mode**: Allows external control of the browser from a local terminal via the Midscene SDK:
   - Creates a communication channel between external tools and the browser
   - Useful for hybrid automation (scripts + manual interaction)
   - Provides status monitoring and logging

4. **Playground**: A testing environment for browser automation commands:
   - Supports different AI action types (aiAction, aiQuery, aiAssert, aiTap)
   - Shows execution results and reports
   - Integrates with the extension's agent system

### State Management

The extension uses Zustand for state management with these main stores:

1. **RecordStore**: Manages recording state and event capture
2. **RecordingSessionStore**: Handles persistence and organization of recording sessions
3. **EnvConfigStore**: Manages environment configuration and extension behavior settings

### Building and Packaging Process

The build process includes:
1. Building the web application using RSBuild
2. Copying static assets to the output directory
3. Packaging the extension as a zip file for distribution

### Worker and Content Script Architecture

The extension uses a service worker architecture:
1. Background service worker (`worker.ts`) handles extension lifecycle and communication
2. Content scripts are injected into web pages to interact with the DOM
3. The recording system uses injected scripts to capture events in target pages

## Key Files and Directories

- `src/extension/`: Chrome extension-specific components
- `src/extension/popup.tsx`: Main extension popup UI
- `src/extension/bridge.tsx`: Bridge mode implementation
- `src/extension/record.tsx`: Event recording implementation
- `src/scripts/`: Service worker and content scripts
- `src/utils/eventOptimizer.ts`: Event optimization for the recording feature
- `src/store.tsx`: State management for the extension
- `static/manifest.json`: Extension manifest configuration

## Data Flow

1. User interactions:
   - User clicks extension icon → popup.tsx renders interface
   - User selects tab → appropriate component (Playground/Record/Bridge) is displayed
   - Recorded events flow from content scripts → service worker → extension UI

2. Recording flow:
   - Record component injects scripts into active tab
   - Content scripts capture DOM events
   - Events are processed, optimized and stored in RecordStore
   - Sessions are persisted to localStorage

3. Bridge mode flow:
   - Bridge establishes connection and listens for external commands
   - External tools connect through the API
   - Commands are executed in the browser
   - Results are sent back to the external tool

## Integration with Midscene Packages

The extension integrates with several workspace packages:
- `@midscene/visualizer`: For UI components and visualization
- `@midscene/web`: For browser automation
- `@midscene/core`: For core functionality
- `@midscene/record`: For event recording capabilities
- `@midscene/report`: For reporting
- `@midscene/shared`: For shared utilities

## Extension Versioning

- The version number in `package.json` is used for the extension package
- The output file is named `midscene-extension-v{version}.zip`
- When updating versions, ensure both `package.json` and relevant UI references are updated