# Remote Browser - CDP Connector

Connect to any CDP-compatible browser via WebSocket URL and use Midscene's AI capabilities.

## Overview

The Remote Browser module provides a simple way to connect to any browser that supports the Chrome DevTools Protocol (CDP). This allows you to use Midscene's AI-powered browser automation with:

- Local Chrome/Chromium instances
- Remote browsers (Docker, cloud services, etc.)
- Headless browsers
- Any CDP-compatible browser implementation

## Installation

```bash
npm install @midscene/web
```

## Quick Start

```typescript
import { connectToCdp } from '@midscene/web/remote-browser';

// Connect to a CDP browser
const agent = await connectToCdp('ws://localhost:9222/devtools/browser/xxx', {
  engine: 'puppeteer', // or 'playwright'
});

// Use AI methods
await agent.aiAction('Click the login button');
const result = await agent.aiQuery('Get the page title: {title: string}');
await agent.aiAssert('The page contains "Welcome"');

// Cleanup
await agent.cleanup();
```

## API Reference

### `connectToCdp(cdpWsUrl, options?)`

Connect to a CDP WebSocket URL and create an agent.

**Parameters:**

- `cdpWsUrl: string` - CDP WebSocket URL (e.g., `ws://localhost:9222/devtools/browser/xxx`)
- `options?: CdpConnectionOptions` - Connection options
  - `engine?: 'puppeteer' | 'playwright'` - Browser engine to use (default: `'puppeteer'`)
  - `connectionTimeout?: number` - Connection timeout in milliseconds (default: `30000`)
  - ...other `WebPageAgentOpt` options

**Returns:** `Promise<PuppeteerAgent | PlaywrightAgent>`

The returned agent includes all standard AI methods plus:
- `getCdpWsUrl(): string` - Get the CDP WebSocket URL
- `getRemotePage(): RemoteBrowserPage` - Get the underlying page wrapper
- `cleanup(): Promise<void>` - Disconnect and cleanup resources

## Usage Examples

### Example 1: Connect to Local Chrome

```typescript
import { connectToCdp } from '@midscene/web/remote-browser';

// Start Chrome with remote debugging:
// chrome --remote-debugging-port=9222

const agent = await connectToCdp('ws://localhost:9222/devtools/browser/xxx');

await agent.aiAction('Navigate to https://example.com');
await agent.aiAction('Click the "Learn More" button');

await agent.cleanup();
```

### Example 2: Connect to Docker Chrome

```typescript
import { connectToCdp } from '@midscene/web/remote-browser';

// Assuming you have a Docker container running Chrome:
// docker run -p 9222:9222 browserless/chrome

const agent = await connectToCdp('ws://localhost:9222/devtools/browser/xxx', {
  engine: 'puppeteer',
});

await agent.aiAction('Search for "Midscene.js"');
const results = await agent.aiQuery('Get search results: {titles: string[]}');

console.log('Results:', results);

await agent.cleanup();
```

### Example 3: Connect to Browserless

```typescript
import { connectToCdp } from '@midscene/web/remote-browser';

const agent = await connectToCdp('wss://chrome.browserless.io?token=YOUR_TOKEN');

await agent.aiAction('Navigate to https://github.com');
await agent.aiAction('Search for "midscenejs"');

await agent.cleanup();
```

### Example 4: Using Playwright Engine

```typescript
import { connectToCdp } from '@midscene/web/remote-browser';

const agent = await connectToCdp('ws://localhost:9222/devtools/browser/xxx', {
  engine: 'playwright', // Use Playwright instead of Puppeteer
});

await agent.aiAction('Click the submit button');
await agent.cleanup();
```

### Example 5: Advanced Usage with Underlying Page

```typescript
import { connectToCdp } from '@midscene/web/remote-browser';

const agent = await connectToCdp('ws://localhost:9222/devtools/browser/xxx');

// Get the underlying page for direct manipulation
const remotePage = agent.getRemotePage();
const browser = remotePage.getBrowser();
const page = remotePage.getPage();

// Use Puppeteer/Playwright directly
await page.goto('https://example.com');
const title = await page.title();
console.log('Page title:', title);

// Mix with AI actions
await agent.aiAction('Scroll to the bottom');

await agent.cleanup();
```

## How to Get CDP WebSocket URL

### Local Chrome/Chromium

1. Start Chrome with remote debugging:
   ```bash
   chrome --remote-debugging-port=9222
   ```

2. Get the WebSocket URL:
   ```bash
   curl http://localhost:9222/json/version
   ```

   Look for the `webSocketDebuggerUrl` field in the response.

### Docker Chrome

```bash
# Run Chrome in Docker
docker run -p 9222:9222 browserless/chrome

# Get WebSocket URL
curl http://localhost:9222/json/version
```

### Cloud Services

For cloud browser services (Browserless, BrowserStack, etc.), refer to their documentation for obtaining the CDP WebSocket URL.

## Supported CDP Browsers

- **Chrome/Chromium** - Full support
- **Microsoft Edge** - Full support (Chromium-based)
- **Brave** - Full support (Chromium-based)
- **Opera** - Full support (Chromium-based)
- **Browserless** - Full support
- **Any Chromium-based browser** - Full support

## TypeScript Support

Full TypeScript support with type definitions:

```typescript
import { connectToCdp, type CdpConnectionOptions, type BrowserEngine } from '@midscene/web/remote-browser';

const options: CdpConnectionOptions = {
  engine: 'puppeteer',
  connectionTimeout: 30000,
};

const agent = await connectToCdp('ws://localhost:9222/devtools/browser/xxx', options);
```

## Error Handling

```typescript
import { connectToCdp, CdpConnectionError } from '@midscene/web/remote-browser';

try {
  const agent = await connectToCdp('ws://localhost:9222/devtools/browser/xxx');
  await agent.aiAction('Click the button');
} catch (error) {
  if (error instanceof CdpConnectionError) {
    console.error('CDP connection failed:', error.message);
    console.error('Error code:', error.code);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Best Practices

1. **Always cleanup**: Call `agent.cleanup()` when done to properly disconnect
2. **Use try-finally**: Ensure cleanup happens even if errors occur
3. **Connection timeout**: Set an appropriate timeout for your use case
4. **Engine selection**: Choose `puppeteer` for faster performance, `playwright` for better cross-browser support

```typescript
let agent;
try {
  agent = await connectToCdp('ws://localhost:9222/devtools/browser/xxx', {
    connectionTimeout: 60000, // 1 minute
  });

  await agent.aiAction('...');
} finally {
  if (agent) {
    await agent.cleanup();
  }
}
```

## Related

- [Puppeteer Agent](../puppeteer/README.md)
- [Playwright Agent](../playwright/README.md)
- [Midscene Core Documentation](https://midscenejs.com/docs)

## License

MIT
