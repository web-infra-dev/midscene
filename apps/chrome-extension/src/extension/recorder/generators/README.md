# Test Generators

This directory contains optimized test generators for converting recorded browser events into executable test code.

## Architecture

The generators are organized with a shared utilities approach to eliminate code duplication and improve maintainability:

```
generators/
├── index.ts                    # Main exports
├── playwrightGenerator.ts      # Playwright test generation
├── yamlGenerator.ts           # YAML test generation
├── shared/
│   ├── types.ts               # Shared type definitions
│   └── testGenerationUtils.ts # Common utilities
└── README.md                  # This file
```

## Key Improvements

### 1. **Eliminated Code Duplication**
- Shared utilities for event processing, screenshot handling, and error management
- Common type definitions for all generators
- Unified validation and data preparation logic

### 2. **Better Error Handling**
- Centralized error handling with consistent error messages
- Proper logging integration
- Graceful fallbacks for edge cases

### 3. **Improved Type Safety**
- Comprehensive TypeScript interfaces
- Strict type checking for all generator options
- Better IntelliSense support

### 4. **Enhanced Maintainability**
- Single source of truth for common logic
- Easier to add new generators
- Consistent API across all generators

## Usage

### Playwright Generator

```typescript
import { generatePlaywrightTest } from './generators/playwrightGenerator';

const testCode = await generatePlaywrightTest(events, {
  testName: 'My Test',
  waitForNetworkIdle: true,
  waitForNetworkIdleTimeout: 2000,
  viewportSize: { width: 1280, height: 800 },
  maxScreenshots: 3,
  includeScreenshots: true,
});
```

### YAML Generator

```typescript
import { generateYamlTest, exportEventsToYaml } from './generators/yamlGenerator';

// Generate YAML content
const yamlContent = await generateYamlTest(events, {
  testName: 'My Test',
  includeScreenshots: true,
  includeTimestamps: true,
  maxScreenshots: 3,
});

// Export directly to file
exportEventsToYaml(events, 'session-name', {
  includeScreenshots: false,
  includeTimestamps: true,
});
```

### Using Shared Utilities

```typescript
import {
  validateEvents,
  prepareEventSummary,
  getScreenshotsForLLM,
  createMessageContent,
  handleTestGenerationError,
} from './generators/shared/testGenerationUtils';

// Validate events before processing
validateEvents(events);

// Prepare standardized event summary
const summary = prepareEventSummary(events, {
  testName: 'My Test',
  maxScreenshots: 3,
});

// Get screenshots for AI context
const screenshots = getScreenshotsForLLM(events, 3);

// Create message content for AI
const messageContent = createMessageContent(
  'Your prompt text here',
  screenshots,
  true // include screenshots
);
```

## Shared Utilities

### `testGenerationUtils.ts`

#### `validateEvents(events: ChromeRecordedEvent[])`
Validates that events array is not empty and throws descriptive errors.

#### `prepareEventSummary(events, options)`
Creates a standardized summary object containing:
- Event counts by type
- Page titles and URLs
- Element descriptions
- Input values
- Test metadata

#### `getScreenshotsForLLM(events, maxScreenshots)`
Extracts and prioritizes screenshots from events:
- Prioritizes navigation and click events
- Returns up to `maxScreenshots` unique screenshots
- Prefers `screenshotWithBox` over other types

#### `createMessageContent(promptText, screenshots, includeScreenshots)`
Creates properly formatted message content for AI:
- Combines text prompt with screenshots
- Handles image URL formatting for AI models
- Returns array suitable for AI API calls

#### `handleTestGenerationError(error, context)`
Centralized error handling for test generation:
- Logs errors with proper context
- Provides user-friendly error messages
- Maintains error consistency across generators

## Types

### `BaseGeneratorOptions`
Common options for all generators:
```typescript
interface BaseGeneratorOptions {
  testName?: string;
  maxScreenshots?: number;
  includeScreenshots?: boolean;
}
```

### `PlaywrightGeneratorOptions`
Playwright-specific options:
```typescript
interface PlaywrightGeneratorOptions extends BaseGeneratorOptions {
  viewportSize?: { width: number; height: number };
  waitForNetworkIdle?: boolean;
  waitForNetworkIdleTimeout?: number;
}
```

### `YamlGeneratorOptions`
YAML-specific options:
```typescript
interface YamlGeneratorOptions extends BaseGeneratorOptions {
  description?: string;
  includeTimestamps?: boolean;
}
```

### `EventSummary`
Standardized event summary structure:
```typescript
interface EventSummary {
  testName: string;
  startUrl: string;
  eventCounts: {
    navigation: number;
    click: number;
    input: number;
    scroll: number;
    total: number;
  };
  pageTitles: string[];
  urls: string[];
  clickDescriptions: string[];
  inputDescriptions: Array<{
    description: string;
    value: string;
  }>;
  events: ProcessedEvent[];
}
```

## Benefits of This Architecture

1. **Reduced Bundle Size**: Shared utilities mean less duplicated code
2. **Easier Testing**: Isolated utilities can be unit tested independently
3. **Consistent Behavior**: All generators use the same core logic
4. **Future-Proof**: Easy to add new generators (e.g., Cypress, Selenium)
5. **Better Debugging**: Centralized error handling and logging
6. **Type Safety**: Comprehensive TypeScript coverage

## Migration Guide

If you're updating existing code that used the old generators:

### Before (Old API)
```typescript
import { generatePlaywrightTest } from './generatePlaywrightTest';
import { generateYamlTest } from './generateYamlTest';
```

### After (New API)
```typescript
// Option 1: Use the backward-compatible exports
import { generatePlaywrightTest } from './generatePlaywrightTest';
import { generateYamlTest } from './generateYamlTest';

// Option 2: Use the new optimized generators directly
import { generatePlaywrightTest } from './generators/playwrightGenerator';
import { generateYamlTest } from './generators/yamlGenerator';

// Option 3: Use the main index export
import { generatePlaywrightTest, generateYamlTest } from './generators';
```

The API remains the same, so no code changes are required for existing usage.
