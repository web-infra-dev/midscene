import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { VNCMidsceneTools } from './mcp-tools';

const tools = new VNCMidsceneTools();
runToolsCLI(tools, 'midscene-vnc', { stripPrefix: 'vnc_' }).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
