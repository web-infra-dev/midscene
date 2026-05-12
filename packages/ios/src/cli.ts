import { createReportCliCommands } from '@midscene/core';
import { reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import { IOSMidsceneTools } from './mcp-tools';

declare const __VERSION__: string;
const tools = new IOSMidsceneTools();
runToolsCLI(tools, 'midscene-ios', {
  stripPrefix: 'ios_',
  version: __VERSION__,
  extraCommands: createReportCliCommands(),
}).catch((e) => {
  process.exit(reportCLIError(e));
});
