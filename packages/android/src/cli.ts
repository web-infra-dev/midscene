import { CLIError, runToolsCLI } from '@midscene/shared/cli';
import { AndroidMidsceneTools } from './mcp-tools';

const tools = new AndroidMidsceneTools();
runToolsCLI(tools, 'midscene-android', { stripPrefix: 'android_' }).catch(
  (e) => {
    if (!(e instanceof CLIError)) console.error(e);
    process.exit(e instanceof CLIError ? e.exitCode : 1);
  },
);
