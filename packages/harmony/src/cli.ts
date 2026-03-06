import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { HarmonyMidsceneTools } from './mcp-tools';

const tools = new HarmonyMidsceneTools();
runToolsCLI(tools, 'midscene-harmony', { stripPrefix: 'harmony_' }).catch(
  (e) => {
    if (!(e instanceof CLIError)) console.error(e);
    process.exit(e instanceof CLIError ? e.exitCode : 1);
  },
);
