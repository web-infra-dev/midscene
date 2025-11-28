#!/usr/bin/env node
import { parseArgs } from 'node:util';
import {
  type CLIArgs,
  CLI_ARGS_CONFIG,
  launchMCPServer,
} from '@midscene/shared/mcp';
import { IOSMCPServer } from './server.js';

const { values } = parseArgs({ options: CLI_ARGS_CONFIG });

launchMCPServer(new IOSMCPServer(), values as CLIArgs).catch(console.error);
