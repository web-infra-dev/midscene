# @midscene/web-mcp

Midscene MCP Server for Web automation (alias for @midscene/mcp).

This package is an alias for `@midscene/mcp`, which provides web automation capabilities.

## Installation

```bash
npm install @midscene/web-mcp
```

Or use the original package:

```bash
npm install @midscene/mcp
```

## Usage

See [@midscene/mcp documentation](../mcp/README.md) for full usage instructions.

### CLI Mode

```bash
npx @midscene/web-mcp
```

### Programmatic API

```typescript
import { WebMCPServer } from '@midscene/web-mcp';

const server = new WebMCPServer();
await server.launch();
```

## Available Tools

All tools from @midscene/mcp are available. See the main MCP package for details.

## License

MIT
