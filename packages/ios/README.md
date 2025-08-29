# @midscene/ios

iOS automation package for Midscene.js with coordinate mapping support for iOS device mirroring.

## Features

- **iOS Device Mirroring**: Control iOS devices through screen mirroring on macOS
- **Coordinate Mapping**: Automatic transformation from iOS coordinates to macOS screen coordinates  
- **AI Integration**: Use natural language to interact with iOS interfaces
- **Screenshot Capture**: Take region-specific screenshots of iOS mirrors
- **PyAutoGUI Backend**: Reliable macOS system control through Python server

## Installation

```bash
npm install @midscene/ios
```

## Prerequisites

1. **Python 3** with required packages:

   ```bash
   pip3 install flask pyautogui
   ```

2. **macOS Accessibility Permissions**:
   - Go to System Preferences → Security & Privacy → Privacy → Accessibility
   - Add your terminal application to the list
   - Required for PyAutoGUI to control mouse and keyboard

3. **iOS Device Mirroring**:
   - iPhone Mirroring (macOS Sequoia)

## Getting iPhone Mirroring Window Coordinates

To use iOS automation, you need to determine where the iPhone Mirroring window is positioned on your macOS screen. We provide a helpful AppleScript that automatically detects this for you.

### Using the AppleScript

```bash
# Navigate to the iOS package directory
cd packages/ios

# Run the script to get window coordinates
osascript scripts/getAppWindowRect.scpt
```

**Important**: The script gives you 4 seconds to make the iPhone Mirroring app the foreground window before it captures the coordinates.

The output will look like:

```text
{"iPhone Mirroring", {692, 161}, {344, 764}}
```

This means:

- App name: "iPhone Mirroring"
- Position: x=692, y=161 (use these for `mirrorX` and `mirrorY`)
- Size: width=344, height=764 (use these for `mirrorWidth` and `mirrorHeight`)

## Quick Start

### 1. Start PyAutoGUI Server

```bash
cd packages/ios/idb
python3 auto_server.py 1412
```

### 2. Configure iOS Mirroring

First, get the mirror window coordinates using the AppleScript mentioned above, then:

```typescript
import { iOSDevice, iOSAgent } from '@midscene/ios';

const device = new iOSDevice({
  serverPort: 1412,
  mirrorConfig: {
    mirrorX: 692,       // Mirror position on macOS screen
    mirrorY: 161,
    mirrorWidth: 344,   // Mirror size on macOS screen
    mirrorHeight: 764
  }
});

await device.connect();
const agent = new iOSAgent(device);

// AI interactions with automatic coordinate mapping
await agent.aiTap('Settings app');
await agent.aiInput('Wi-Fi', 'Search settings');
const settings = await agent.aiQuery('string[], visible settings');
```

### 3. Basic Device Control

```typescript
// Direct coordinate operations
await device.tap({ left: 100, top: 200 });
await device.input('Hello', { left: 150, top: 300 });
await device.scroll({ direction: 'down', distance: 200 });

// Screenshots (automatically crops to iOS mirror region)
const screenshot = await device.screenshotBase64();
```

## API Reference

### agentFromPyAutoGUI(options?)

Creates an iOS agent with PyAutoGUI backend.

**Options:**

- `serverUrl?: string` - Custom server URL (default: `http://localhost:1412`)
- `serverPort?: number` - Server port (default: `1412`)
- `autoDismissKeyboard?: boolean` - Auto dismiss keyboard (not applicable for desktop)

### iOSDevice Methods

#### `launch(uri: string): Promise<iOSDevice>`

Launch an application or URL.

- For URLs: `await device.launch('https://example.com')`
- For apps: `await device.launch('Safari')`

#### `size(): Promise<Size>`

Get screen dimensions and pixel ratio.

#### `screenshotBase64(): Promise<string>`

Take a screenshot and return as base64 string.

#### `tap(point: Point): Promise<void>`

Click at the specified coordinates.

#### `hover(point: Point): Promise<void>`

Move mouse to the specified coordinates.

#### `input(text: string): Promise<void>`

Type text using the keyboard.

#### `keyboardPress(key: string): Promise<void>`

Press a specific key. Supported keys:

- `'Return'`, `'Enter'` - Enter key
- `'Tab'` - Tab key
- `'Space'` - Space bar
- `'Backspace'` - Backspace
- `'Delete'` - Delete key
- `'Escape'` - Escape key

#### `scroll(options: ScrollOptions): Promise<void>`

Scroll in the specified direction.

**ScrollOptions:**

- `direction: 'up' | 'down' | 'left' | 'right'`
- `distance?: number` - Scroll distance in pixels (default: 100)

## PyAutoGUI Server API

The Python server accepts POST requests to `/run` with JSON payloads:

### Supported Actions

#### Click

```json
{
  "action": "click",
  "x": 100,
  "y": 100
}
```

#### Move (Hover)

```json
{
  "action": "move",
  "x": 200,
  "y": 200,
  "duration": 0.2
}
```

#### Drag

```json
{
  "action": "drag",
  "x": 100,
  "y": 100,
  "x2": 200,
  "y2": 200,
  "duration": 0.5
}
```

#### Type

```json
{
  "action": "type",
  "text": "Hello World",
  "interval": 0.0
}
```

#### Key Press

```json
{
  "action": "key",
  "key": "return"
}
```

#### Hotkey Combination

```json
{
  "action": "hotkey",
  "keys": ["cmd", "c"]
}
```

#### Scroll

```json
{
  "action": "scroll",
  "x": 400,
  "y": 300,
  "clicks": 3
}
```

#### Sleep

```json
{
  "action": "sleep",
  "seconds": 1.0
}
```

### Health Check

GET `/health` - Returns server status and screen information.

## Architecture

```text
┌─────────────────┐    HTTP    ┌─────────────────┐    PyAutoGUI    ┌─────────────────┐
│   TypeScript    │   ────>    │  Python Server  │    ─────────>   │   macOS System  │
│   iOS Agent     │            │  (Flask + PyAutoGUI) │            │   (Mouse/Keyboard)  │
└─────────────────┘            └─────────────────┘                 └─────────────────┘
```

## Troubleshooting

### Accessibility Permissions

If you get permission errors, ensure your terminal has accessibility permissions:

1. System Preferences → Security & Privacy → Privacy
2. Select "Accessibility" from the left sidebar
3. Click the lock to make changes
4. Add your terminal application to the list

### Python Dependencies

```bash
# Install required Python packages
pip3 install flask pyautogui

# On macOS, you might also need:
pip3 install pillow
```

### Port Already in Use

If port 1412 is already in use, specify a different port:

```typescript
const agent = await agentFromPyAutoGUI({ serverPort: 1413 });
```

## Example

See `examples/ios-mirroring-demo.js` for a complete usage example.

## License

MIT
