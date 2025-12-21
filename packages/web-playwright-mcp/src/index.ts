import { parseArgs } from 'node:util';
import { type CLIArgs, CLI_ARGS_CONFIG } from '@midscene/shared/mcp';
import { PlaywrightMCPServer } from './server.js';

const { values } = parseArgs({ options: CLI_ARGS_CONFIG });
const args = values as CLIArgs;

const server = new PlaywrightMCPServer();

if (args.mode === 'http') {
  server
    .launchHttp({
      port: Number.parseInt(args.port || '3000', 10),
      host: args.host || 'localhost',
    })
    .catch(console.error);
} else {
  server.launch().catch(console.error);
}
