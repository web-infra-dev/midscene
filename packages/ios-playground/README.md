# @midscene/ios-playground

iOS playground for Midscene.js - Control iOS devices through natural language commands using screen mirroring.

## Quick Start

```bash
npx @midscene/ios-playground
```

This will:

1. Automatically start the PyAutoGUI server on port 1412
2. Launch the iOS playground web interface
3. Open the playground in your default browser

## Prerequisites

1. **macOS System**: iOS playground requires macOS (tested on macOS 11 and later).

2. **Python 3 and Dependencies**: The playground will automatically manage the PyAutoGUI server, but you need Python 3 with required packages:

   ```bash
   pip3 install pyautogui flask flask-cors
   ```

3. **iPhone Mirroring**: Use iPhone Mirroring (macOS Sequoia) to mirror your physical iPhone to your Mac screen.

4. **AI Model Configuration**: Set up your AI model credentials. See [Midscene documentation](https://midscenejs.com/choose-a-model) for supported models.

## Features

- **Automatic Server Management**: PyAutoGUI server starts and stops automatically
- **Auto-Detection**: Automatically detects iPhone Mirroring window position and size
- **Natural Language Control**: Control iOS devices using natural language commands
- **Screenshot Capture**: Takes screenshots of only the iOS mirrored region
- **Coordinate Transformation**: Automatically maps iOS coordinates to macOS screen coordinates
- **Real-time Interaction**: Direct interaction with iOS interface elements through AI

## Usage

1. **Start the playground**:

   ```bash
   npx @midscene/ios-playground
   ```

2. **Set up iPhone Mirroring**: Open iPhone Mirroring app on your Mac (macOS Sequoia) and connect your iPhone

3. **Configure AI Model**: In the playground web interface, configure your AI model credentials

4. **Auto-detect or Manual Setup**:
   - Click "Auto Detect iOS Mirror" for automatic configuration, or
   - Manually set the mirror region coordinates

5. **Use natural language commands** to interact with your iOS device:

   - **Action**: "tap the Settings app"
   - **Query**: "extract the battery percentage"
   - **Assert**: "the home screen is visible"

## Development

To run the playground in development mode:

```bash
cd packages/ios-playground
npm install
npm run dev:server
```

This will build the project and start the server locally.

## Architecture

The iOS playground architecture consists of:

- **Frontend**: Web-based interface for AI interaction (built with React/TypeScript)
- **Playground Server**: Express.js server that bridges between frontend and iOS automation
- **PyAutoGUI Server**: Python Flask server for screen capture and input control
- **iPhone Mirroring**: macOS iPhone Mirroring for device display
- **Midscene AI Core**: AI-powered automation engine with iOS device adapter
- **Coordinate Transformation**: Automatic mapping between iOS logical coordinates and macOS screen coordinates

## How It Works

1. **Screen Mirroring**: iOS device screen is displayed on macOS through iPhone Mirroring
2. **Auto-Detection**: Python server detects the mirroring window position and size using AppleScript
3. **Coordinate Mapping**: iOS logical coordinates (e.g., 200, 400) are automatically transformed to macOS screen coordinates
4. **AI Processing**: Midscene AI analyzes screenshots and determines actions based on natural language commands
5. **Action Execution**: Actions are executed on the macOS screen within the iOS mirrored region

## Troubleshooting

### PyAutoGUI Server Issues

If the PyAutoGUI server fails to start automatically, check:

```bash
# Check if port 1412 is available
lsof -i :1412
# Manually start the server
cd packages/ios
node bin/server.js 1412
```

### iPhone Mirroring Detection Issues

1. Ensure iPhone Mirroring app is open and visible on screen
2. Try clicking "Auto Detect iOS Mirror" in the playground interface
3. Manually configure mirror coordinates if auto-detection fails
4. Check that the iPhone Mirroring window is not minimized

### Permission Issues

On macOS, you may need to grant the following permissions:

- **Accessibility**: System Preferences > Security & Privacy > Privacy > Accessibility
- **Screen Recording**: System Preferences > Security & Privacy > Privacy > Screen Recording

Add Terminal, Python, or your development environment to these permission lists.

### Python Dependencies

If you encounter Python-related errors:

```bash
# Install or upgrade required packages
pip3 install --upgrade pyautogui flask flask-cors

# On macOS, you might need to install using conda or homebrew
brew install python@3.11
```

### Mirror Region Configuration

If clicks are not landing in the right place:

1. Use the "Auto Detect iOS Mirror" feature first
2. If manual configuration is needed, measure the exact position and size of your iPhone Mirroring window
3. Account for window borders and title bars when setting coordinates

## Related Documentation

- [Midscene.js Documentation](https://midscenejs.com/)
- [API Reference](https://midscenejs.com/api)
- [Choosing AI Models](https://midscenejs.com/choose-a-model)
