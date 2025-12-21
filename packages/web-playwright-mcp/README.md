# Midscene Web Playwright MCP

Midscene MCP Server for Web automation using Playwright.

## Overview

This package provides an MCP (Model Context Protocol) server that enables AI agents to control web browsers using Playwright. Unlike the bridge mode (`@midscene/web-bridge-mcp`), this mode launches and controls a browser instance directly through Playwright.

## Features

- **Direct Browser Control**: Launches and controls Chromium browser via Playwright
- **Full Automation**: Supports navigation, clicking, typing, scrolling, and more
- **AI-Powered Actions**: Use natural language to describe actions
- **Screenshot Capture**: Returns screenshots after each action

## Installation

```bash
npm install @midscene/web-playwright-mcp
# or
pnpm add @midscene/web-playwright-mcp
```

## Usage

### As CLI (stdio mode)

```bash
npx @midscene/web-playwright-mcp
```

### As HTTP Server

```bash
npx @midscene/web-playwright-mcp --mode http --port 3000
```

### In MCP Configuration

```json
{
  "mcpServers": {
    "midscene-web-playwright": {
      "command": "npx",
      "args": ["@midscene/web-playwright-mcp"]
    }
  }
}
```

## Available Tools

- `web_connect`: Launch browser and navigate to a URL
- Action tools generated from Midscene's web action space (click, type, scroll, etc.)

## Documentation

Full documentation: https://midscenejs.com/mcp.html

## License

MIT
