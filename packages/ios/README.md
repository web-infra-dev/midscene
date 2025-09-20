# @midscene/ios

iOS automation library for Midscene, providing AI-powered testing and automation capabilities for iOS simulators and devices.

## Features

- 🎯 **iOS Simulator Support** - Full automation support for iOS simulators
- 🤖 **AI-Powered Actions** - Intelligent element detection and interaction
- 📱 **Native iOS Actions** - Home button, app switcher, and iOS-specific gestures
- 🔧 **Simple API** - Easy-to-use interface similar to @midscene/android
- 📸 **Screenshot Capture** - Built-in screenshot functionality
- ⌨️ **Text Input** - Support for text input including non-ASCII characters
- 🎮 **Gesture Support** - Tap, swipe, long press, and custom gestures

## Prerequisites

- **macOS** (required for iOS development)
- **Xcode** and Xcode Command Line Tools
- **iOS Simulator** or physical iOS device

### Installation

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Verify simctl is available
xcrun simctl list devices
```

## Installation

```bash
npm install @midscene/ios
# or
pnpm add @midscene/ios
```

## Quick Start

### Using iOS Simulator

```typescript
import { agentFromIOSSimulator } from '@midscene/ios';

// Connect to default booted simulator
const agent = await agentFromIOSSimulator();

// Or specify a simulator by name
const agent = await agentFromIOSSimulator('iPhone 15');

// Launch an app
await agent.launch('com.apple.MobileSafari');

// Perform AI-powered actions
await agent.aiAction('tap on the address bar');
await agent.aiAction('type "https://example.com"');
await agent.aiAction('tap the go button');
```

### Using Specific Device

```typescript
import { agentFromIOSDevice, getConnectedDevices } from '@midscene/ios';

// List available devices
const devices = await getConnectedDevices();
console.log('Available devices:', devices);

// Connect to specific device
const agent = await agentFromIOSDevice('your-device-udid');

// Launch app and interact
await agent.launch('com.yourapp.bundleid');
await agent.aiAction('tap the login button');
```

## API Reference

### IOSDevice

Core device automation class implementing the AbstractInterface.

```typescript
import { IOSDevice } from '@midscene/ios';

const device = new IOSDevice('device-udid');
await device.connect();

// Basic interactions
await device.tap(100, 200);
await device.swipe(100, 200, 300, 400);
await device.typeText('Hello World');
await device.pressKey('Enter');

// iOS-specific actions
await device.home();
await device.appSwitcher();
await device.longPress(150, 300, 1000);

// Screenshots
const screenshot = await device.screenshotBase64();

// Cleanup
await device.destroy();
```

### IOSAgent

High-level agent for AI-powered automation.

```typescript
import { IOSAgent, agentFromIOSDevice } from '@midscene/ios';

const agent = await agentFromIOSDevice('udid');

// AI actions
await agent.aiAction('tap the settings icon');
await agent.aiQuery('what is the current battery level?');
await agent.aiWaitFor('the page is loaded');

// App management
await agent.launch('com.apple.Preferences');
```

### Utility Functions

```typescript
import {
  getConnectedDevices,
  getDefaultDevice,
  ensureSimulatorBooted,
  installApp,
  launchApp,
} from '@midscene/ios';

// Device discovery
const devices = await getConnectedDevices();
const defaultDevice = await getDefaultDevice();

// Simulator management
await ensureSimulatorBooted('device-udid');

// App management
await installApp('device-udid', '/path/to/app.app');
await launchApp('device-udid', 'com.yourapp.bundleid');
```

## Configuration

Set environment variables for default behavior:

```bash
# Default device UDID
export MIDSCENE_IOS_DEVICE_UDID=your-device-udid

# Default simulator UDID
export MIDSCENE_IOS_SIMULATOR_UDID=your-simulator-udid
```

## Supported iOS Actions

### Basic Gestures
- `tap(x, y)` - Single tap at coordinates
- `doubleTap(x, y)` - Double tap at coordinates
- `longPress(x, y, duration)` - Long press with duration
- `swipe(fromX, fromY, toX, toY)` - Swipe gesture

### Text Input
- `typeText(text)` - Type text using iOS keyboard
- `pressKey(key)` - Press specific keys (Enter, Backspace, etc.)
- `clearInput(element)` - Clear input field

### Scrolling
- `scrollUp/Down/Left/Right(distance?, startPoint?)` - Directional scrolling
- `scrollUntilTop/Bottom/Left/Right(startPoint?)` - Scroll to extremes

### iOS System Actions
- `home()` - Press home button
- `appSwitcher()` - Open app switcher
- `hideKeyboard()` - Dismiss keyboard

### AI-Powered Actions
- `aiAction(instruction)` - Perform action based on natural language
- `aiQuery(question)` - Query UI state with natural language
- `aiWaitFor(condition)` - Wait for condition to be met

## Device Requirements

### iOS Simulators
- Managed through Xcode
- No additional setup required
- Supports all iOS versions available in Xcode

### Physical iOS Devices
- Requires iOS 9.0 or later
- Device must be in Developer Mode
- Requires valid provisioning profile for your apps

## Examples

### Complete Test Example

```typescript
import { describe, it } from 'vitest';
import { agentFromIOSSimulator } from '@midscene/ios';

describe('iOS App Test', () => {
  it('should login to app', async () => {
    const agent = await agentFromIOSSimulator('iPhone 15');
    
    // Launch your app
    await agent.launch('com.yourcompany.yourapp');
    
    // AI-powered login flow
    await agent.aiAction('tap on email field');
    await agent.aiAction('type "user@example.com"');
    await agent.aiAction('tap on password field');
    await agent.aiAction('type "password123"');
    await agent.aiAction('tap the login button');
    
    // Verify successful login
    await agent.aiWaitFor('dashboard is visible');
    
    const isLoggedIn = await agent.aiQuery('is the user logged in?');
    expect(isLoggedIn).toBe(true);
  });
});
```

## Troubleshooting

### Common Issues

1. **"No iOS devices available"**
   - Ensure Xcode is installed
   - Check `xcrun simctl list devices` shows available simulators
   - Try booting a simulator manually in Xcode

2. **"Command failed: xcrun simctl"**
   - Verify Xcode Command Line Tools are installed
   - Run `xcode-select --install` if needed
   - Check `which xcrun` returns a valid path

3. **Simulator not responding**
   - Restart the simulator
   - Try `xcrun simctl shutdown all && xcrun simctl boot <udid>`

4. **App launch fails**
   - Verify the bundle ID is correct
   - Ensure the app is installed on the simulator
   - Check app permissions and entitlements

### Debug Mode

Enable debug logging:

```typescript
process.env.DEBUG = 'ios:*';
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.