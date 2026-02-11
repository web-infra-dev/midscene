import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { WebMidsceneTools } from './mcp-tools';

const tools = new WebMidsceneTools();
runToolsCLI(tools, 'midscene-web', { stripPrefix: 'web_' }).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
