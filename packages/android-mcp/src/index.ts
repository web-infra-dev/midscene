import { parseArgs } from 'node:util';
import { AndroidMCPServer } from '@midscene/android/mcp-server';
import { type CLIArgs, CLI_ARGS_CONFIG } from '@midscene/shared/mcp';

const { values } = parseArgs({ options: CLI_ARGS_CONFIG });
const args = values as CLIArgs;

const server = new AndroidMCPServer();

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
