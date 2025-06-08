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
   - **AI-Powered Export Formats**:
     - **Playwright Tests**: Uses AI to generate executable Playwright test code with @midscene/web/playwright
     - **YAML Configuration**: Uses AI to generate structured YAML test configurations suitable for various automation frameworks
     - **JSON Events**: Exports raw event data in JSON format
   - Implements advanced optimization strategies including caching, deduplication, and debouncing
   - Uses intelligent fallback mechanisms for AI service failures

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

## Record System Implementation Details

### Architecture Overview

The Record System follows a layered architecture:

```
Record System
├── UI Layer
│   ├── Record (Main Component)
│   ├── RecordList (Session List)  
│   ├── RecordDetail (Session Details)
│   └── SessionModals (Session Modals)
├── Hook Layer (Logic Layer)
│   ├── useRecordingControl (Recording Control)
│   ├── useRecordingSession (Session Management)
│   ├── useTabMonitoring (Tab Monitoring)
│   └── useLifecycleCleanup (Lifecycle Cleanup)
├── Service Layer
│   ├── eventOptimizer (Event Optimization)
│   ├── Chrome APIs (Browser APIs)
│   └── Content Scripts
└── Storage Layer
    ├── RecordStore (Recording State)
    └── RecordingSessionStore (Session Storage)
```

### Core Recording Hooks

**useRecordingControl** (`src/extension/record/hooks/useRecordingControl.ts`):
- Manages start/stop recording lifecycle
- Handles event reception and processing
- Monitors tab changes and automatically stops recording
- Manages script injection to web pages

**useRecordingSession** (`src/extension/record/hooks/useRecordingSession.ts`):
- Creates, updates, and deletes recording sessions
- Handles session selection and switching
- Exports events to different formats

### Event Optimization System

**eventOptimizer** (`src/utils/eventOptimizer.ts`) implements sophisticated optimization strategies:

1. **Caching Strategy**:
   - Description cache for AI-generated element descriptions
   - Screenshot cache for element screenshots
   - LRU eviction with max 100 items

2. **Debouncing Mechanism**:
   - 1-second debounce delay for AI description generation
   - Prevents duplicate requests for the same element
   - Improves performance during rapid user interactions

3. **Deduplication**:
   - Cache key generation based on element position and dimensions
   - Ongoing request tracking to prevent duplicate AI calls
   - Fallback descriptions when AI services fail

### Recording Data Flow

1. **Recording Start**:
   - User clicks start → Check environment → Create/select session
   - Inject content scripts → Send start message → Establish event listening
   - Update UI to recording state

2. **Event Capture**:
   - User performs operations → Content script captures events
   - Extract event data → Forward through service worker
   - Apply optimization (cache check, screenshot generation, AI description)
   - Update session and refresh UI

3. **Recording Stop**:
   - User stops or page refresh triggers stop
   - Collect final events → Generate AI title/description
   - Update session status → Clean up state and listeners

### Session Data Structure

```typescript
interface RecordingSession {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  events: ChromeRecordedEvent[];
  status: 'idle' | 'recording' | 'completed';
  url?: string;
}
```

### Performance Optimizations

- **Asynchronous Processing**: Non-blocking UI with background AI processing
- **Intelligent Caching**: Element-based caching reduces redundant AI calls
- **Batch Updates**: Efficient state updates for multiple events
- **Memory Management**: LRU cache prevents memory leaks

### Error Handling

- **Script Injection Failures**: Detects Chrome internal pages, provides retry mechanisms
- **AI Service Failures**: Automatic fallback to basic descriptions
- **Page Refresh Handling**: Auto-saves data and cleans up state

### Security Considerations

- Local data storage only
- Secure message passing between extension components
- Permission checks for tab access
- Screenshot data handled securely

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

## Documentation Maintenance

**IMPORTANT**: When making changes to key recording system logic, ensure this CLAUDE.md file is updated to reflect the changes:

### Critical Areas Requiring Documentation Updates:

1. **Recording Flow Changes**: Updates to start/stop recording logic in `useRecordingControl.ts`
2. **Event Optimization**: Modifications to caching, debouncing, or AI description logic in `eventOptimizer.ts`
3. **Session Management**: Changes to session data structure or persistence logic in `useRecordingSession.ts`
4. **Performance Optimizations**: New caching strategies, memory management, or optimization algorithms
5. **Error Handling**: New error handling patterns or fallback mechanisms
6. **Security Updates**: Changes to permission handling, data protection, or message passing security

### When to Update Documentation:

- Changing debounce delays or cache sizes
- Modifying AI description generation logic
- Adding new event types or processing strategies  
- Updating session data structures or storage format
- Implementing new performance optimizations
- Adding or changing error handling mechanisms
- Modifying the recording lifecycle flow

Always update both the high-level architecture description and specific implementation details when making significant changes to ensure Claude Code has accurate information about the current system state.