import { createReportCliCommands } from '@midscene/core';
import { reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import { HarmonyMidsceneTools } from './mcp-tools';

declare const __VERSION__: string;
const tools = new HarmonyMidsceneTools();
runToolsCLI(tools, 'midscene-harmony', {
  stripPrefix: 'harmony_',
  version: __VERSION__,
  extraCommands: createReportCliCommands(),
}).catch((e) => {
  process.exit(reportCLIError(e));
});
