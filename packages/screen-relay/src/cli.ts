import { createReportCliCommands } from '@midscene/core';
import { reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import { ScreenRelayMidsceneTools } from './agent-tools';
import { sanitizeScreenRelayCliArgs } from './target';

declare const __VERSION__: string;

const { sanitizedArgv: argv, extractedToken } = sanitizeScreenRelayCliArgs(
  process.argv.slice(2),
);
const tools = new ScreenRelayMidsceneTools(argv, extractedToken);
runToolsCLI(tools, 'midscene-screen-relay', {
  argv,
  version: __VERSION__,
  extraCommands: createReportCliCommands(),
})
  .finally(() => tools.destroy())
  .catch((error) => {
    process.exit(reportCLIError(error));
  });
