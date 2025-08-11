# Midscene iOS Playground

A playground for testing Midscene iOS automation features with automatic device mirroring setup.

See https://midscenejs.com/ for details.

## Features

### ✨ Auto-Detection of iPhone Mirroring

The playground can automatically detect and configure the iPhone Mirroring app window:

1. **Automatic Setup**: When you connect, the playground automatically tries to detect your iPhone Mirroring window
2. **Smart Configuration**: It calculates the optimal screen mapping based on window size and device type  
3. **Manual Override**: If auto-detection doesn't work, you can manually configure the mirror settings

### 🎯 How Auto-Detection Works

1. **Window Detection**: Uses AppleScript to find the iPhone Mirroring app window
2. **Content Area Calculation**: Automatically calculates the device screen area within the window (excluding title bars and padding)
3. **Device Matching**: Matches the aspect ratio to common iOS devices for optimal coordinate mapping
4. **Instant Configuration**: Sets up the coordinate transformation automatically

## Usage

### Prerequisites

1. **macOS with iPhone Mirroring**: Ensure iPhone Mirroring is available and working
2. **iOS Device**: Connected and mirroring to your Mac
3. **Python Server**: The PyAutoGUI server running on port 1412

### Quick Start

1. **Start the server**:
   ```bash
   cd packages/ios/idb
   python auto_server.py
   ```

2. **Launch the playground**:
   ```bash
   npm run dev
   ```

3. **Open iPhone Mirroring app** on your Mac

4. **Auto-configure**: Click "Auto Detect" to automatically set up the mirroring coordinates

### UI Controls

- **📷 Screenshot**: Take a screenshot of the configured iOS device area
- **🔍 Auto Detect**: Automatically detect and configure iPhone Mirroring window  
- **⚙️ Manual Config**: Manually set mirror window coordinates

## Troubleshooting

### Auto-Detection Issues

1. **"iPhone Mirroring app not found"**: Make sure iPhone Mirroring app is open and visible
2. **"Window seems too small"**: Try resizing the iPhone Mirroring window to be larger
3. **Coordinates seem wrong**: Use manual configuration to fine-tune the coordinates

### Server Connection Issues

1. **Server not responding**: Check if server is running on port 1412
2. **Permission issues**: Ensure macOS accessibility permissions are granted to Terminal/Python
