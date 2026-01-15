# @midscene/computer-playground

Midscene Computer Playground - PC desktop automation playground for Windows, macOS, and Linux.

## Usage

```bash
npx @midscene/computer-playground
```

Or install globally:

```bash
npm install -g @midscene/computer-playground
midscene-computer-playground
```

## Features

- Simple web UI for PC desktop automation
- Supports Windows, macOS, and Linux
- AI-powered natural language commands
- Real-time execution feedback
- Automatic window minimization during task execution (restores after completion)

## How It Works

When you start the playground, a browser window will open with a simple interface. When you execute a task:

1. The browser window automatically minimizes to stay out of the way
2. Midscene controls your desktop (mouse, keyboard, screenshots)
3. After the task completes (success or error), the window automatically restores

**Platform Notes:**
- **macOS**: Uses AppleScript for window control
- **Windows**: Uses PowerShell for minimization
- **Linux**: Requires `xdotool` for window control (`sudo apt install xdotool`)
