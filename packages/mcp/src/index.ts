#!/usr/bin/env node
import { parseArgs } from 'node:util';
import {
  type CLIArgs,
  CLI_ARGS_CONFIG,
  launchMCPServer,
} from '@midscene/shared/mcp';
import { DeprecatedMCPServer } from './server.js';

const { values } = parseArgs({ options: CLI_ARGS_CONFIG });
const args = values as CLIArgs;

const server = new DeprecatedMCPServer();

launchMCPServer(server, args).catch(console.error);
