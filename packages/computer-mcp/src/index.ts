import { parseArgs } from 'node:util';
import { ComputerMCPServer } from '@midscene/computer/mcp-server';
import {
  type CLIArgs,
  CLI_ARGS_CONFIG,
  launchMCPServer,
} from '@midscene/shared/mcp';

const { values } = parseArgs({ options: CLI_ARGS_CONFIG });
const args = values as CLIArgs;

const server = new ComputerMCPServer();

launchMCPServer(server, args).catch(console.error);
