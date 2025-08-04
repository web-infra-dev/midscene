# iOS Device Mirroring with Coordinate Mapping

This document explains how to use Midscene.js with iOS device mirroring through macOS, including automatic coordinate transformation for accurate touch events.

## Overview

iOS device mirroring allows you to control iOS devices through their screen representation on macOS. This is useful for:

- **App Testing**: Automated testing of iOS apps without physical interaction
- **Screen Recording**: Capture iOS interactions for documentation
- **Remote Control**: Control iOS devices through macOS automation
- **CI/CD Integration**: Automated iOS testing in continuous integration

## Prerequisites

1. **Python Dependencies**:
   ```bash
   pip3 install flask pyautogui
   ```

2. **iOS Device Mirroring Setup** (choose one):
   - **QuickTime Player**: Connect iOS device → File → New Movie Recording → Select iOS device
   - **iPhone Mirroring** (macOS Sequoia): Built-in iOS mirroring feature
   - **iOS Simulator**: Xcode's iOS Simulator
   - **Third-party tools**: Reflector, AirServer, etc.

3. **Screen Position**: Note the exact position and size of iOS mirror on your macOS screen

## Configuration

### 1. Basic Setup

```typescript
import { iOSDevice, iOSAgent } from '@midscene/ios';

const device = new iOSDevice({
  serverPort: 1412,
  iOSMirrorConfig: {
    mirrorX: 100,       // Mirror position X on macOS screen
    mirrorY: 50,        // Mirror position Y on macOS screen
    mirrorWidth: 400,   // Mirror width on macOS screen
    mirrorHeight: 800   // Mirror height on macOS screen
  }
});

await device.connect();
const agent = new iOSAgent(device);
```

### 2. Finding Mirror Coordinates

**Method 1: Manual Measurement**
1. Position iOS mirror window on your screen
2. Use macOS's built-in screenshot tool to measure:
   - Press `Cmd + Shift + 4`
   - Drag from top-left to bottom-right of iOS mirror
   - Note the coordinates and dimensions

**Method 2: Using Digital Color Meter**
1. Open Digital Color Meter (Applications → Utilities)
2. Move cursor to top-left corner of iOS mirror → note coordinates
3. Move cursor to bottom-right corner → calculate width/height

**Method 3: Programmatic Detection** (Advanced)
```python
# Use this Python script to help find iOS mirror region
import pyautogui
import cv2
import numpy as np

def find_ios_mirror():
    # Take screenshot
    screenshot = pyautogui.screenshot()
    
    # Convert to OpenCV format
    img = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
    
    # Look for iOS-specific UI patterns (status bar, home indicator, etc.)
    # This is a simplified example - real implementation would be more complex
    
    # Return detected region
    return {"x": 100, "y": 50, "width": 400, "height": 800}
```

## Coordinate Transformation

The system automatically transforms iOS coordinates to macOS screen coordinates:

### Transformation Formula
```
macOS_x = mirror_x + (iOS_x × scale_x)
macOS_y = mirror_y + (iOS_y × scale_y)

where:
scale_x = mirror_width / ios_width
scale_y = mirror_height / ios_height
```

### Example
```
iOS Device: 393×852 (iPhone 15 Pro)
Mirror Region: (100, 50) with size 400×800

iOS coordinate (100, 200) transforms to:
macOS_x = 100 + (100 × 400/393) = 100 + 101.8 = ~202
macOS_y = 50 + (200 × 800/852) = 50 + 187.8 = ~238
```

## Usage Examples

### Basic Touch Operations

```typescript
// Tap at iOS coordinates - automatically transformed
await device.tap({ left: 100, top: 200 });

// Drag gesture
await device.drag(
  { left: 100, top: 300 },  // Start point
  { left: 300, top: 300 }   // End point
);

// Scroll
await device.scroll({ 
  direction: 'down', 
  startPoint: { left: 200, top: 400 },
  distance: 200 
});
```

### AI-Powered Automation

```typescript
// AI can understand iOS interface elements
await agent.aiTap('Settings app icon');
await agent.aiInput('Wi-Fi', 'Search bar');
await agent.aiScroll({ direction: 'down', scrollType: 'once' });

// Extract data from iOS interface
const appList = await agent.aiQuery('string[], visible app names on home screen');

// Verify iOS interface state
await agent.aiAssert('Control Center is open');
```

### Screenshots

```typescript
// Takes screenshot of iOS mirror region only
const screenshot = await device.screenshotBase64();

// Screenshot is automatically cropped to iOS mirror area
// Perfect for AI analysis of iOS interface
```

## Common Device Information (For Reference)

Note: These logical resolutions are automatically detected by the system. You only need to configure the mirror position and size on your macOS screen.

### iPhone Models
```typescript
// iPhone 15 Pro / 14 Pro: 393 x 852 logical pixels
// iPhone 15 Plus / 14 Plus: 428 x 926 logical pixels  
// iPhone SE (3rd generation): 375 x 667 logical pixels
// iPhone 15 / 14: 393 x 852 logical pixels
```

### iPad Models
```typescript
// iPad Pro 12.9" (6th generation): 1024 x 1366 logical pixels
// iPad Pro 11" (4th generation): 834 x 1194 logical pixels
// iPad Air (5th generation): 820 x 1180 logical pixels
```

## Best Practices

### 1. Calibration Testing
```typescript
// Always test coordinate accuracy first
const testPoints = [
  { left: 50, top: 50 },      // Top-left corner
  { left: 196, top: 426 },    // Center (for iPhone 15 Pro)
  { left: 343, top: 802 }     // Bottom-right corner
];

for (const point of testPoints) {
  await device.tap(point);
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

### 2. Handle Different Mirror Sizes
```typescript
// Support multiple mirror configurations
const configs = {
  small: { mirrorWidth: 300, mirrorHeight: 600 },
  medium: { mirrorWidth: 400, mirrorHeight: 800 },
  large: { mirrorWidth: 500, mirrorHeight: 1000 }
};

// Choose based on screen size or user preference
const config = configs.medium;
```

### 3. Error Handling
```typescript
try {
  await device.connect();
} catch (error) {
  if (error.message.includes('Python server')) {
    console.error('Start Python server: python3 auto_server.py 1412');
  } else if (error.message.includes('configuration')) {
    console.error('Check mirror coordinates and iOS device size');
  }
  throw error;
}
```

### 4. Performance Optimization
```typescript
// Batch operations for better performance
const actions = [
  { action: 'click', x: 100, y: 200 },
  { action: 'sleep', seconds: 0.5 },
  { action: 'click', x: 200, y: 300 }
];

// All actions use coordinate transformation
await device.executeBatchActions(actions);
```

## Troubleshooting

### Common Issues

**1. Coordinate Misalignment**
- **Problem**: Taps don't hit intended targets
- **Solution**: Re-measure mirror position and size, ensure iOS device orientation is correct

**2. Python Server Connection Failed**
- **Problem**: `Failed to connect to Python server`
- **Solution**: Start server with `python3 auto_server.py 1412`, check firewall settings

**3. Screenshots Show Wrong Region**
- **Problem**: Screenshots include macOS desktop instead of iOS mirror
- **Solution**: Verify mirror coordinates, ensure iOS window is not minimized

**4. Scale Factor Issues**
- **Problem**: Coordinates are consistently off by same ratio
- **Solution**: Double-check iOS device logical resolution vs mirror size

### Debug Tools

```typescript
// Check current configuration
const config = await device.getConfiguration();
console.log('Current mapping:', config);

// Test coordinate transformation
const testCoord = { left: 100, top: 200 };
console.log('iOS:', testCoord);
// Tap will show transformed macOS coordinates in logs
await device.tap(testCoord);
```

## Advanced Features

### Dynamic Reconfiguration
```typescript
// Change mirror configuration at runtime
await device.configureIOSMirror({
  mirrorX: 200,       // New position
  mirrorY: 100,
  mirrorWidth: 450,   // New size for different device
  mirrorHeight: 950
});
```

### Multiple Device Support
```typescript
// Control multiple iOS devices
const device1 = new iOSDevice({ 
  serverPort: 1412, 
  iOSMirrorConfig: config1 
});

const device2 = new iOSDevice({ 
  serverPort: 1413,  // Different server instance
  iOSMirrorConfig: config2 
});
```

### Integration with Test Frameworks
```typescript
// Jest/Vitest example
describe('iOS App Tests', () => {
  let device, agent;
  
  beforeAll(async () => {
    device = new iOSDevice({ /* config */ });
    await device.connect();
    agent = new iOSAgent(device);
  });
  
  test('should login successfully', async () => {
    await agent.aiTap('Login button');
    await agent.aiInput('user@example.com', 'Email field');
    await agent.aiInput('password123', 'Password field');
    await agent.aiTap('Sign in button');
    await agent.aiAssert('Dashboard is visible');
  });
});
```

This coordinate mapping system makes iOS device automation through macOS screen mirroring seamless and accurate, enabling powerful AI-driven testing and automation workflows.
