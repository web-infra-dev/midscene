import { createReportCliCommands } from '@midscene/core';
import { reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import { ComputerMidsceneTools } from './mcp-tools';

declare const __VERSION__: string;
const tools = new ComputerMidsceneTools();
runToolsCLI(tools, 'midscene-computer', {
  stripPrefix: 'computer_',
  version: __VERSION__,
  extraCommands: createReportCliCommands(),
}).catch((e) => {
  process.exit(reportCLIError(e));
});
