import { parseArgs } from 'node:util';
import { HarmonyMCPServer } from '@midscene/harmony/mcp-server';
import {
  type CLIArgs,
  CLI_ARGS_CONFIG,
  launchMCPServer,
} from '@midscene/shared/mcp';

const { values } = parseArgs({ options: CLI_ARGS_CONFIG });
const args = values as CLIArgs;

const server = new HarmonyMCPServer();

launchMCPServer(server, args).catch(console.error);
