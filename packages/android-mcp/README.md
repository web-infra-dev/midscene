# @midscene/android-mcp

Midscene MCP Server for Android automation.

## Installation

```bash
npm install @midscene/android-mcp
```

## Prerequisites

- Android Debug Bridge (ADB) installed and available in PATH
- At least one Android device connected via USB or emulator running

## Usage

### CLI Mode

```bash
npx @midscene/android-mcp
```

### Programmatic API

```typescript
import { AndroidMCPServer } from '@midscene/android-mcp';

const server = new AndroidMCPServer();
await server.launch();
```

## Available Tools

### Action Space Tools

Dynamically generated from AndroidAgent's action space:

- `launch` - Launch an Android app or URL
- `tap` - Tap on UI elements
- `input` - Input text into fields
- `swipe` - Swipe gestures
- `back` - Android back button
- `home` - Android home button
- `recentApps` - Recent apps button
- `runAdbShell` - Execute ADB shell commands

### Common Tools

- `take_screenshot` - Capture screenshot of current screen
- `wait_for` - Wait until condition becomes true
- `assert` - Assert condition is true

### Platform-Specific Tools

- `android_connect` - Connect to a specific Android device by device ID
- `android_list_devices` - List all connected Android devices

## Configuration

Set environment variables in `.env`:

```bash
OPENAI_API_KEY=your_api_key
MIDSCENE_MODEL_NAME=qwen3-vl-plus
```

## License

MIT
