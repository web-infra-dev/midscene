#!/bin/bash

echo "Setting up iOS package dependencies..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3 first."
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"

# Check if pip3 is available
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not available. Please install pip3 first."
    exit 1
fi

echo "✅ pip3 found: $(pip3 --version)"

# Install required Python packages
echo "Installing Python dependencies..."
pip3 install flask pyautogui pillow requests

echo "✅ Python dependencies installed"

# Make the server script executable
chmod +x bin/server.js

echo "✅ iOS package setup completed!"
echo ""
echo "To test the setup:"
echo "1. Start the server: npm run server"
echo "2. Run example: npm run example"
