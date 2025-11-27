#!/usr/bin/env node
import { WebMCPServer } from './server.js';

// CLI entry: create and launch web MCP server
const server = new WebMCPServer();
server.launch().catch(console.error);
