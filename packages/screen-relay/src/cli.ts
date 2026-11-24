import { createReportCliCommands } from '@midscene/core';
import { reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import {
  ScreenRelayMidsceneTools,
  normalizeScreenRelayHelpArgv,
} from './agent-tools';
import { sanitizeScreenRelayCliArgs } from './target';

declare const __VERSION__: string;

const { sanitizedArgv, extractedToken } = sanitizeScreenRelayCliArgs(
  process.argv.slice(2),
);
const argv = normalizeScreenRelayHelpArgv(sanitizedArgv);
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
