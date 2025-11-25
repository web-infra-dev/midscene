#!/usr/bin/env node
import { WebMCPServer } from './server.js';

// CLI entry: create and launch server
const server = new WebMCPServer();
server.launch().catch(console.error);
