import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { HarmonyMidsceneTools } from './mcp-tools';

declare const __VERSION__: string;
const tools = new HarmonyMidsceneTools();
runToolsCLI(tools, 'midscene-harmony', {
  stripPrefix: 'harmony_',
  version: __VERSION__,
}).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
