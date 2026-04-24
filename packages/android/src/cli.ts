import { createReportCliCommands } from '@midscene/core';
import { reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import { AndroidMidsceneTools } from './mcp-tools';

declare const __VERSION__: string;
const tools = new AndroidMidsceneTools();

runToolsCLI(tools, 'midscene-android', {
  stripPrefix: 'android_',
  version: __VERSION__,
  extraCommands: createReportCliCommands(),
}).catch((e) => {
  process.exit(reportCLIError(e));
});
