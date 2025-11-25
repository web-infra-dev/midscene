# @midscene/ios-mcp

Midscene MCP Server for iOS automation.

## Installation

```bash
npm install @midscene/ios-mcp
```

## Prerequisites

- macOS with Xcode installed
- iOS Simulator or physical iOS device
- WebDriverAgent set up (automatically detected)

## Usage

### CLI Mode

```bash
npx @midscene/ios-mcp
```

### Programmatic API

```typescript
import { IOSMCPServer } from '@midscene/ios-mcp';

const server = new IOSMCPServer();
await server.launch();
```

## Available Tools

### Action Space Tools

Dynamically generated from IOSAgent's action space:

- `launch` - Launch an iOS app or URL
- `tap` - Tap on UI elements
- `input` - Input text into fields
- `swipe` - Swipe gestures
- `home` - iOS home button
- `appSwitcher` - iOS app switcher
- `runWdaRequest` - Execute WebDriverAgent API requests

### Common Tools

- `take_screenshot` - Capture screenshot of current screen
- `wait_for` - Wait until condition becomes true
- `assert` - Assert condition is true

### Platform-Specific Tools

- `ios_check_environment` - Check iOS environment availability (Xcode, simulators, WebDriverAgent)

## Configuration

Set environment variables in `.env`:

```bash
OPENAI_API_KEY=your_api_key
MIDSCENE_MODEL_NAME=qwen3-vl-plus
```

## License

MIT
