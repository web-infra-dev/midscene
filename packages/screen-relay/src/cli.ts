import { createReportCliCommands } from '@midscene/core';
import { reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import { ScreenRelayMidsceneTools } from './agent-tools';
import {
  MIDSCENE_SCREEN_RELAY_TOKEN,
  sanitizeScreenRelayCliArgs,
} from './target';

declare const __VERSION__: string;

const { sanitizedArgv, extractedToken } = sanitizeScreenRelayCliArgs(
  process.argv.slice(2),
);
if (extractedToken) {
  process.env[MIDSCENE_SCREEN_RELAY_TOKEN] = extractedToken;
}

const tools = new ScreenRelayMidsceneTools();
runToolsCLI(tools, 'midscene-screen-relay', {
  argv: sanitizedArgv,
  stripPrefix: 'screen_relay_',
  version: __VERSION__,
  extraCommands: createReportCliCommands(),
}).catch((error) => {
  process.exit(reportCLIError(error));
});
