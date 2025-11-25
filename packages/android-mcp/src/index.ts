#!/usr/bin/env node
import { AndroidMCPServer } from './server.js';

// CLI entry: create and launch Android MCP server
const server = new AndroidMCPServer();
server.launch().catch(console.error);
