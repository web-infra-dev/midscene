# Midscene.js Chrome Extension - AGENTS.md

## Overview

Midscene.js Chrome Extension is a powerful browser automation tool that integrates AI-driven web operations, recording and playback, Bridge mode, and other features. This extension provides users with an intuitive interface to execute natural language-driven web automation tasks.

## Core Features

### 1. Playground Mode (Intelligent Testing Environment)
- **AI Action**: Execute web operations using natural language, such as clicking, typing, etc.
- **AI Query**: Query web content and information through natural language
- **AI Assert**: Verify web state and content meets expectations
- **AI Tap**: Intelligently click page elements
- **Real-time Context Preview**: Display current page UI structure and state
- **Deep Think Mode**: Enable more detailed AI reasoning process

### 2. Recording Mode (Record & Playback)
- **Event Recording**: Automatically record user actions on web pages
- **Session Management**: Create, manage, and save multiple recording sessions
- **Event Playback**: Support re-execution of recorded events
- **Export Function**: Export recorded events to shareable formats
- **Real-time Event Monitoring**: Display all user interaction events during recording

### 3. Bridge Mode
- **Local Terminal Control**: Allow controlling browser through local SDK
- **Real-time Connection Status**: Monitor connection status and task execution progress
- **Logging**: Detailed recording of all operations and status changes
- **Auto-reconnect**: Automatically attempt to reconnect when connection is lost

## File Structure Details

```
chrome-extension/
├── dist/                    # Build output directory, can be directly installed as Chrome extension
├── extension_output/        # Packaged extension files directory
├── src/                     # Source code directory
│   ├── extension/           # Extension-related components
│   │   ├── popup.tsx        # Extension popup main interface (130 lines)
│   │   ├── popup.less       # Popup style file (146 lines)
│   │   ├── bridge.tsx       # Bridge mode component (262 lines)
│   │   ├── bridge.less      # Bridge mode styles (131 lines)
│   │   ├── record.tsx       # Recording function component (344 lines)
│   │   ├── record.less      # Recording function styles (62 lines)
│   │   ├── misc.tsx         # Utility components (50 lines)
│   │   └── common.less      # Common style variables (26 lines)
│   ├── component/           # Common components
│   │   └── playground.tsx   # Playground testing environment (265 lines)
│   ├── scripts/             # Script files
│   │   ├── worker.ts        # Service Worker
│   │   ├── water-flow.ts    # Page flow control
│   │   └── stop-water-flow.ts # Stop flow control
│   ├── store.tsx            # State management (208 lines)
│   ├── utils.ts             # Utility functions (75 lines)
│   ├── App.tsx              # Main application component (8 lines)
│   ├── App.less             # Main application styles (30 lines)
│   ├── index.tsx            # Entry file (14 lines)
│   └── env.d.ts             # Type definitions (2 lines)
├── static/                  # Static resources directory
│   ├── manifest.json        # Extension manifest file (30 lines)
│   ├── icon128.png          # Extension icon
│   └── fonts/               # Font files
├── scripts/                 # Build and utility scripts
│   └── pack-extension.js    # Extension packaging script (81 lines)
├── package.json             # Project configuration file (39 lines)
├── rsbuild.config.ts        # Build configuration (85 lines)
├── tsconfig.json            # TypeScript configuration (24 lines)
└── README.md                # Project documentation (142 lines)
```

## Core File Details

### 1. Main Component Files

#### `src/extension/popup.tsx` (Main Interface)
- **Function**: Main popup interface of the extension, containing three main tabs
- **Component**: `PlaygroundPopup` - Main extension interface component
- **Tabs**:
  - Playground: AI-driven testing environment
  - Record: Recording and playback functionality
  - Bridge Mode: Bridge mode
- **Dependencies**: Ant Design UI component library, @midscene/visualizer
- **Features**: Responsive design, theme configuration, version information display

#### `src/extension/bridge.tsx` (Bridge Mode)
- **Function**: Implement communication bridge between local terminal and browser
- **Core Class**: `BridgeConnector` - Manages connection state and communication
- **Status Types**: listening, connected, disconnected, closed
- **Features**:
  - Auto-reconnect mechanism
  - Real-time status monitoring
  - Detailed logging
  - Connection status visualization

#### `src/extension/record.tsx` (Recording Function)
- **Function**: Record user operations on web pages and support playback
- **Main Functions**:
  - Script injection and recording startup
  - Event listening and handling
  - Session management (create, update, delete)
  - Event export and timeline display
- **Storage**: Uses Zustand for state management
- **Communication**: Communicates with content script through Chrome messaging API

#### `src/component/playground.tsx` (Testing Environment)
- **Function**: Provides AI-driven web automation testing environment
- **Supported Operation Types**:
  - aiAction: Execute web operations
  - aiQuery: Query web information
  - aiAssert: Verify web state
  - aiTap: Intelligent clicking
- **Features**:
  - Real-time context preview
  - Responsive layout
  - Error handling and formatting
  - Interrupt and retry mechanism

### 2. Configuration and Build Files

#### `static/manifest.json` (Extension Manifest)
```json
{
  "name": "Midscene.js",
  "description": "Open-source SDK for automating web pages using natural language through AI.",
  "version": "0.68",
  "manifest_version": 3,
  "permissions": ["activeTab", "tabs", "sidePanel", "debugger", "scripting"],
  "host_permissions": ["<all_urls>"]
}
```

#### `rsbuild.config.ts` (Build Configuration)
- **Multi-environment Build**: web environment for UI, iife environment for worker scripts
- **Entry Points**: 
  - index: Main application entry
  - popup: Popup entry
  - worker: Service Worker
- **Resource Processing**: Static file copying, script file handling
- **Alias Configuration**: React deduplication, Node.js module polyfill

#### `package.json` (Project Configuration)
- **Core Dependencies**:
  - @midscene/* series packages: Core functionality modules
  - React 19: UI framework
  - Ant Design: UI component library
  - Zustand: State management
- **Build Tools**: Rsbuild as main build tool
- **Scripts**: build, dev, preview, pack-extension

### 3. State Management

#### `src/store.tsx` (Global State)
- **RecordStore**: Recording functionality state management
  - isRecording: Recording status
  - events: Recorded events list
  - Event operation methods
- **RecordingSessionStore**: Recording session management
  - sessions: Session list
  - currentSessionId: Current session ID
  - Session CRUD operations
- **EnvConfig**: Environment configuration management
  - AI configuration
  - Theme settings
  - Tab status

### 4. Tools and Utility Files

#### `src/utils.ts` (Utility Functions)
- **Extension Version Retrieval**: `getExtensionVersion()`
- **Chrome API Helper Functions**
- **Error Handling Tools**
- **Type Definitions and Interfaces**

#### `scripts/pack-extension.js` (Packaging Script)
- **Function**: Package build artifacts into Chrome extension zip file
- **Processing**: Copy necessary files, generate versioned compressed package
- **Output**: Zip file in extension_output directory

## Technical Architecture

### 1. Frontend Architecture
- **Framework**: React 19 + TypeScript
- **UI Library**: Ant Design 5.x
- **State Management**: Zustand
- **Styling**: Less + CSS Modules
- **Build**: Rsbuild (based on Rspack)

### 2. Chrome Extension Architecture
- **Manifest V3**: Uses latest extension API specification
- **Service Worker**: Background script handling
- **Content Scripts**: Page content operations
- **Popup**: Extension main interface
- **Side Panel**: Sidebar support

### 3. Communication Mechanism
- **Chrome Messaging**: Communication between popup and content script
- **WebSocket**: Local communication for Bridge mode
- **Event Listening**: Event capture for recording functionality
- **Port Connection**: Long connection communication support

## Development Workflow

### 1. Environment Setup
```bash
# Install dependencies
pnpm install

# Build dependency packages
pnpm run build

# Development mode
cd apps/chrome-extension
pnpm run dev
```

### 2. Build and Package
```bash
# Build extension
pnpm run build

# Generated files:
# - dist/ directory: Extension ready for direct loading
# - extension_output/ directory: Packaged zip files
```

### 3. Debugging Methods
- **Background Script Debugging**: Chrome extensions page → View background page
- **Popup Debugging**: Right-click popup → Inspect
- **Content Script Debugging**: Developer tools → Sources → Content scripts

## Extension Permissions

### Required Permissions
- **activeTab**: Access current active tab
- **tabs**: Tab operations and information retrieval
- **sidePanel**: Sidebar functionality support
- **debugger**: Debugging functionality support
- **scripting**: Script injection capability
- **host_permissions**: All websites access permission

### Security Considerations
- Principle of least privilege
- Local storage of user data
- User confirmation for sensitive operations
- Script injection security checks

## Extension and Customization

### 1. Adding New Features
- Create new components under `src/extension/`
- Add new tabs in `popup.tsx`
- Update state management and routing

### 2. Modifying UI Theme
- Edit `src/extension/common.less`
- Use Ant Design theme customization
- Add custom CSS variables

### 3. Extension API Integration
- Add API wrappers in `src/utils.ts`
- Update type definitions
- Add error handling

## Version Management and Release

### Version Synchronization
- Extension version number syncs with main project
- Update both `package.json` and `manifest.json`
- Follow semantic versioning

### Release Process
1. Update version number
2. Execute complete build testing
3. Generate extension package
4. Submit to Chrome Web Store
5. Update documentation

## Troubleshooting

### Common Issues
1. **Report Template Generation Failure**
   - Check if @midscene/visualizer package is built
   - Confirm packages/visualizer/dist/report/index.html exists

2. **React Hooks Errors**
   - Check for multiple React instances
   - Adjust externals configuration in rsbuild.config.ts

3. **async_hooks Module Not Found**
   - Check alias configuration points correctly to polyfill file

4. **Extension Not Working After Installation**
   - Check Chrome console error messages
   - Verify build process completed fully
   - Check manifest.json permissions configuration

### Debugging Tips
- Enable developer mode to view detailed errors
- Use Chrome extension developer tools
- Check network requests and API calls
- Monitor memory usage and performance

## Future Plans

### Feature Enhancement
- More AI operation types support
- Recording functionality enhancement and optimization
- Bridge mode stability improvement
- Performance optimization and memory management

### Technology Upgrades
- Support for more browsers
- Mobile adaptation
- Offline functionality support
- Cloud synchronization capabilities

This document provides a comprehensive technical overview of Midscene.js Chrome Extension, covering feature specifications, file structure, development workflow, and maintenance guidelines. 