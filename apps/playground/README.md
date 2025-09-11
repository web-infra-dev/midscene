# Midscene Playground

A universal web-based playground for testing and experimenting with Midscene.js features.

## Features

- 🎯 **Universal Interface**: Uses the new UniversalPlayground component with remote execution
- 🔄 **Real-time Server Status**: Monitors playground server connection
- 💾 **Persistent History**: Saves conversation history using localStorage
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎨 **Modern UI**: Clean and intuitive user interface

## Getting Started

### Prerequisites

Make sure you have the playground server running:

```bash
npx @midscene/playground
```

The server will start at `http://localhost:8080` by default.

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Usage

1. **Start the Server**: Run `npx @midscene/playground` to start the backend server
2. **Open the Playground**: Navigate to `http://localhost:3000` (or the dev server URL)
3. **Configure AI**: Click the settings icon to configure your AI model and API keys
4. **Start Testing**: Enter natural language instructions to interact with web pages

## Architecture

This playground uses the new Universal Playground architecture:

- **RemotePlaygroundAdapter**: Connects to the playground server for execution
- **LocalStorageProvider**: Persists conversation history locally
- **UniversalPlayground**: Provides the chat-based interface with progress tracking

## Configuration

The playground connects to `http://localhost:8080` by default. You can modify the server URL in `src/App.tsx` if needed.

## Comparison with Other Playgrounds

| Feature | Playground | Chrome Extension | Android Playground |
|---------|----------------|------------------|-------------------|
| Execution Mode | Remote | Local | Remote |
| UI Style | Chat Interface | Chat Interface | Form + Results |
| History | Persistent | Persistent | Non-persistent |
| Target | Any Web Page | Current Tab | Android Devices |
| Context Preview | Optional | Yes | No |