# @midscene/computer

Midscene.js Computer Desktop Automation - AI-powered desktop automation for Windows, macOS, and Linux.

## Features

- 🖥️ **Desktop Automation**: Control mouse, keyboard, and screen
- 📸 **Screenshot Capture**: Take screenshots of any display
- 🖱️ **Mouse Operations**: Click, double-click, right-click, hover, drag & drop
- ⌨️ **Keyboard Input**: Type text, press keys, shortcuts
- 📜 **Scroll Operations**: Scroll in any direction
- 🖼️ **Multi-Display Support**: Work with multiple monitors
- 🤖 **AI-Powered**: Use natural language to control your desktop
- 🔌 **MCP Server**: Expose capabilities via Model Context Protocol

## Installation

```bash
npm install @midscene/computer
# or
pnpm add @midscene/computer
```

### Platform Requirements

This package uses native modules for desktop control:
- `screenshot-desktop`: For capturing screenshots
- `@computer-use/libnut`: For mouse and keyboard control

These modules require compilation on installation. Make sure you have the necessary build tools:

**macOS**: Install Xcode Command Line Tools
```bash
xcode-select --install
```

**Linux**: Install build essentials
```bash
sudo apt-get install build-essential libx11-dev libxtst-dev libpng-dev
```

**Windows**: Install Windows Build Tools
```bash
npm install --global windows-build-tools
```

## Quick Start

### Basic Usage

```typescript
import { agentFromDesktop } from '@midscene/computer';

// Create an agent
const agent = await agentFromDesktop({
  aiActionContext: 'You are controlling a desktop computer.',
});

// Use AI to perform actions
await agent.aiAct('move mouse to center of screen');
await agent.aiAct('click on the desktop');
await agent.aiAct('type "Hello World"');

// Query information
const screenInfo = await agent.aiQuery(
  '{width: number, height: number}, get screen resolution',
);

// Assert conditions
await agent.aiAssert('There is a desktop visible');
```

### Multi-Display Support

```typescript
import { ComputerDevice, agentFromDesktop } from '@midscene/computer';

// List all displays
const displays = await ComputerDevice.listDisplays();
console.log('Available displays:', displays);

// Connect to a specific display
const agent = await agentFromDesktop({
  displayId: displays[0].id,
});
```

### Environment Check

```typescript
import { checkComputerEnvironment } from '@midscene/computer';

const env = await checkComputerEnvironment();
console.log('Platform:', env.platform);
console.log('Available:', env.available);
console.log('Displays:', env.displays);
```

## Available Actions

The ComputerDevice supports the following actions:

- **Tap**: Single click at element center
- **DoubleClick**: Double click at element center
- **RightClick**: Right click at element center
- **Hover**: Move mouse to element center
- **Input**: Type text with different modes (replace/clear/append)
- **Scroll**: Scroll in any direction (up/down/left/right)
- **KeyboardPress**: Press keyboard keys with modifiers
- **DragAndDrop**: Drag from one element to another
- **ClearInput**: Clear input field content
- **ListDisplays**: Get all available displays

## Platform-Specific Shortcuts

### macOS
- Modifier key: `Cmd` (Command)
- Open search: `Cmd+Space`
- Select all: `Cmd+A`
- Copy: `Cmd+C`
- Paste: `Cmd+V`

### Windows/Linux
- Modifier key: `Ctrl` (Control)
- Open search: `Windows key` or `Super key`
- Select all: `Ctrl+A`
- Copy: `Ctrl+C`
- Paste: `Ctrl+V`

## Testing

### Run Unit Tests

```bash
pnpm test
```

### Run AI Tests

```bash
# Set AI_TEST_TYPE environment variable
AI_TEST_TYPE=computer pnpm test:ai
```

Available AI tests:
- `basic.test.ts`: Basic desktop interactions
- `multi-display.test.ts`: Multi-display support
- `web-browser.test.ts`: Browser automation
- `text-editor.test.ts`: Text editor operations

## MCP Server

Start the MCP server for AI assistant integration:

```typescript
import { mcpServerForAgent } from '@midscene/computer/mcp-server';
import { agentFromDesktop } from '@midscene/computer';

const agent = await agentFromDesktop();
const { server } = mcpServerForAgent(agent);
await server.launch();
```

Available MCP tools:
- `computer_connect`: Connect to desktop display
- `computer_list_displays`: List all available displays
- Plus all standard Midscene tools (aiAct, aiQuery, aiAssert, etc.)

## Architecture

This package follows the same architecture pattern as `@midscene/android` and `@midscene/ios`:

```
packages/computer/
├── src/
│   ├── device.ts        # ComputerDevice - core device implementation
│   ├── agent.ts         # ComputerAgent - agent wrapper
│   ├── utils.ts         # Utility functions
│   ├── mcp-server.ts    # MCP server
│   └── mcp-tools.ts     # MCP tools definitions
├── tests/
│   ├── unit-test/       # Unit tests (no native dependencies)
│   └── ai/              # AI-powered integration tests
└── README.md
```

## API Reference

### ComputerDevice

```typescript
class ComputerDevice implements AbstractInterface {
  constructor(options?: ComputerDeviceOpt);

  static listDisplays(): Promise<DisplayInfo[]>;

  async connect(): Promise<void>;
  async screenshotBase64(): Promise<string>;
  async size(): Promise<Size>;
  actionSpace(): DeviceAction<any>[];
  async destroy(): Promise<void>;
}
```

### ComputerAgent

```typescript
class ComputerAgent extends PageAgent<ComputerDevice> {
  // Inherits all PageAgent methods
  async aiAct(action: string): Promise<void>;
  async aiQuery(query: string): Promise<any>;
  async aiAssert(assertion: string): Promise<void>;
  async aiWaitFor(condition: string): Promise<void>;
}
```

### Factory Functions

```typescript
async function agentFromDesktop(
  opts?: ComputerAgentOpt
): Promise<ComputerAgent>;

async function checkComputerEnvironment(): Promise<EnvironmentCheck>;
async function getConnectedDisplays(): Promise<DisplayInfo[]>;
```

## License

MIT

## Contributing

See the main [Midscene.js repository](https://github.com/web-infra-dev/midscene) for contributing guidelines.
