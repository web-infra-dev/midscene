import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { AndroidMidsceneTools } from './mcp-tools';

declare const __VERSION__: string;
const tools = new AndroidMidsceneTools();
runToolsCLI(tools, 'midscene-android', {
  stripPrefix: 'android_',
  version: __VERSION__,
}).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
