import { parseArgs } from 'node:util';
import {
  type CLIArgs,
  CLI_ARGS_CONFIG,
  launchMCPServer,
} from '@midscene/shared/mcp';
import { WebMCPServer } from '@midscene/web/mcp-server';

const { values } = parseArgs({ options: CLI_ARGS_CONFIG });
const args = values as CLIArgs;

const server = new WebMCPServer();

launchMCPServer(server, args).catch(console.error);
