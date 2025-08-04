# iOS YAML Automation Examples

This directory contains examples of using Midscene.js with iOS devices through YAML configuration files.

## Prerequisites

1. **PyAutoGUI Server**: You need to have a PyAutoGUI server running on your system to communicate with the iOS device.
2. **iOS Device Mirroring**: Your iOS device should be mirrored to your computer screen (using tools like QuickTime Player, AirServer, or similar).
3. **Midscene CLI**: Install the Midscene CLI tool: `npm install -g @midscene/cli`

## Configuration

### Basic iOS Configuration

```yaml
ios:
  # Server configuration (required for iOS automation)
  serverPort: 1412
  serverUrl: "http://localhost:1412"
  
  # Mirror configuration (required for precise targeting)
  mirrorConfig:
    mirrorX: 100      # X position of the mirrored iOS screen
    mirrorY: 200      # Y position of the mirrored iOS screen
    mirrorWidth: 414  # Width of the mirrored screen
    mirrorHeight: 896 # Height of the mirrored screen
```

### Optional Configuration

```yaml
ios:
  # Auto dismiss keyboard after input (optional)
  autoDismissKeyboard: true
  
  # Launch URL or app when starting (optional)
  launch: "https://example.com"
  
  # Output file for results (optional)
  output: "./results.json"
```

## Examples

### 1. Simple iOS Test (`ios-yaml-example.yaml`)

A basic example showing iOS automation with Safari browser interaction.

### 2. Comprehensive Example (`ios-comprehensive-example.yaml`)

A more complex example demonstrating:
- Safari navigation
- Search functionality
- Data extraction
- Settings app interaction
- Home screen operations

### 3. Configuration File (`ios-config.yaml`)

Shows how to use a configuration file to set global iOS settings for multiple test scripts.

## Running the Examples

### Single Script

```bash
# Run a single iOS automation script
midscene ./ios-yaml-example.yaml
```

### Multiple Scripts with Configuration

```bash
# Run multiple scripts using a configuration file
midscene --config ./ios-config.yaml
```

### Command Line Options

You can override iOS settings from the command line:

```bash
# Override mirror settings
midscene --ios.mirrorX 150 --ios.mirrorY 250 ./ios-yaml-example.yaml

# Override server port
midscene --ios.serverPort 1413 ./ios-yaml-example.yaml
```

## Mirror Configuration Setup

1. **Connect your iOS device** to your computer
2. **Enable mirroring** (e.g., using QuickTime Player's "New Movie Recording" and select your iOS device)
3. **Measure the mirror position and size** on your computer screen
4. **Update the mirrorConfig** values in your YAML file:
   - `mirrorX` and `mirrorY`: Top-left corner coordinates of the mirrored screen
   - `mirrorWidth` and `mirrorHeight`: Dimensions of the mirrored screen

## Tips

- Make sure the PyAutoGUI server is running before executing the scripts
- Adjust the `sleep` durations based on your device's performance
- Test the mirror configuration with simple actions first
- Use descriptive prompts in `aiAction` for better AI understanding
- The `aiAssert` statements help verify that actions completed successfully

## Troubleshooting

- **Connection issues**: Verify the PyAutoGUI server is running on the specified port
- **Targeting issues**: Double-check your mirror configuration coordinates
- **Performance issues**: Increase sleep durations between actions
- **Recognition issues**: Use more descriptive text in your AI prompts
