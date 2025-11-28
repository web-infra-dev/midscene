#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { AndroidMCPServer } from './server.js';

// Parse command line arguments
const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'stdio' },
    port: { type: 'string', default: '3000' },
    host: { type: 'string', default: 'localhost' },
  },
});

// CLI entry: create and launch Android MCP server
const server = new AndroidMCPServer();

if (values.mode === 'http') {
  // HTTP mode
  server
    .launchHttp({
      port: Number.parseInt(values.port!),
      host: values.host!,
    })
    .catch(console.error);
} else {
  // stdio mode (default)
  server.launch().catch(console.error);
}
