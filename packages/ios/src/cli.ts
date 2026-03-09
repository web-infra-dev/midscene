import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { IOSMidsceneTools } from './mcp-tools';

const tools = new IOSMidsceneTools();
runToolsCLI(tools, 'midscene-ios', { stripPrefix: 'ios_' }).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
