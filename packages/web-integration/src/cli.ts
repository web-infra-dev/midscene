import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createReportCliCommands } from '@midscene/core';
import { reportCLIError, runToolsCLI } from '@midscene/shared/cli';
import dotenv from 'dotenv';
import { parseWebCliOptions } from './cli-options';
import { WebMidsceneTools } from './mcp-tools';
import { WebCdpMidsceneTools } from './mcp-tools-cdp';
import { WebPuppeteerMidsceneTools } from './mcp-tools-puppeteer';

// Load .env early so MIDSCENE_CDP_ENDPOINT is available during arg parsing
const envFile = join(process.cwd(), '.env');
if (existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

declare const __VERSION__: string;

Promise.resolve()
  .then(() => {
    const parsedOptions = parseWebCliOptions(process.argv.slice(2));

    let tools:
      | WebMidsceneTools
      | WebPuppeteerMidsceneTools
      | WebCdpMidsceneTools;
    if (parsedOptions.mode === 'bridge') {
      tools = new WebMidsceneTools();
    } else if (parsedOptions.mode === 'cdp') {
      tools = new WebCdpMidsceneTools(parsedOptions.cdpEndpoint!);
    } else {
      tools = new WebPuppeteerMidsceneTools(parsedOptions.viewport);
    }

    return runToolsCLI(tools, 'midscene-web', {
      stripPrefix: 'web_',
      argv: parsedOptions.argv,
      version: __VERSION__,
      extraCommands: createReportCliCommands(),
    });
  })
  .catch((e) => {
    process.exit(reportCLIError(e));
  });
