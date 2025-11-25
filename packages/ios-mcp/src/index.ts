#!/usr/bin/env node
import { IOSMCPServer } from './server.js';

// CLI entry: create and launch iOS MCP server
const server = new IOSMCPServer();
server.launch().catch(console.error);
