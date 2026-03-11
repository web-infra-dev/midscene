import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { ComputerMidsceneTools } from './mcp-tools';

declare const __VERSION__: string;
const tools = new ComputerMidsceneTools();
runToolsCLI(tools, 'midscene-computer', {
  stripPrefix: 'computer_',
  version: __VERSION__,
}).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
