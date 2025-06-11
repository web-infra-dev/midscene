# Recorder Module

This module contains the recording functionality for the Chrome extension, refactored for better readability and maintainability.

## File Structure

```
recorder/
├── README.md              # This file
├── index.tsx              # Main component entry
├── types.ts               # Type definitions and Chrome API wrapper
├── utils.ts               # Utility functions
├── components/            # UI Components
│   ├── index.ts
│   ├── RecordList.tsx     # Recording session list component
│   ├── RecordDetail.tsx   # Recording detail component
│   └── SessionModals.tsx  # Session modal components
└── hooks/                 # Custom Hooks
    ├── index.ts
    ├── useRecordingSession.ts  # Session management
    ├── useRecordingControl.ts  # Recording control
    ├── useTabMonitoring.ts     # Tab monitoring
    └── useLifecycleCleanup.ts  # Lifecycle cleanup
```

## Component Overview

### Main Component (index.tsx)
- Combines various hooks and components
- Handles state synchronization and event handling
- Manages view mode switching

### UI Components

#### RecordList
- Displays recording session list
- Provides create, edit, delete, export session functionality
- Session status display and switching

#### RecordDetail  
- Shows detailed information for a single session
- Recording control buttons
- Event timeline display

#### SessionModals
- Create session modal
- Edit session modal
- Form validation and submission

### Custom Hooks

#### useRecordingSession
- Session CRUD operations
- Session state management
- Export functionality

#### useRecordingControl
- Recording start/stop control
- Event listening and processing
- Script injection management

#### useTabMonitoring
- Tab state monitoring
- Page refresh/navigation detection
- Automatic recording stop

#### useLifecycleCleanup
- Component unmount cleanup
- Page visibility monitoring
- Exception handling

## Utility Functions (utils.ts)

- `generateDefaultSessionName()`: Generate default session name
- `checkContentScriptInjected()`: Check if content script is injected
- `ensureScriptInjected()`: Ensure script is injected
- `injectScript()`: Inject recording script
- `exportEventsToFile()`: Export events to file

## Type Definitions (types.ts)

- Chrome API safe wrapper
- Recording-related message types
- View mode type definitions

## Optimization Features

1. **Modularization**: Split large files into small modules with single responsibilities
2. **Separation of Concerns**: Separate UI, logic, and utility functions
3. **Reusability**: Provide reusable logic through hooks
4. **Type Safety**: Comprehensive TypeScript type definitions
5. **State Management**: Unified state management and synchronization mechanism
6. **Error Handling**: Comprehensive exception handling and user feedback

## Usage

```typescript
// Main entry
import Record from './record';

// Use components individually
import { RecordList, RecordDetail } from './record/components';

// Use hooks individually
import { useRecordingSession, useRecordingControl } from './record/hooks';
``` 