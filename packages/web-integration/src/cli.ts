import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { splitReportHtmlByExecution, z } from '@midscene/core';
import {
  CLIError,
  type CLIExtraCommand,
  runToolsCLI,
} from '@midscene/shared/cli';
import dotenv from 'dotenv';
import { WebMidsceneTools } from './mcp-tools';
import { WebCdpMidsceneTools } from './mcp-tools-cdp';
import { WebPuppeteerMidsceneTools } from './mcp-tools-puppeteer';

// Load .env early so MIDSCENE_CDP_ENDPOINT is available during arg parsing
const envFile = join(process.cwd(), '.env');
if (existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

declare const __VERSION__: string;
const isBridge = process.argv.includes('--bridge');
const cdpIdx = process.argv.indexOf('--cdp');
const isCdp = cdpIdx !== -1;

// Fail-fast: mutually exclusive flags
if (isBridge && isCdp) {
  console.error(
    '--bridge and --cdp are mutually exclusive. Please specify only one.',
  );
  process.exit(1);
}

// Parse --cdp endpoint value
let cdpEndpoint: string | undefined;
if (isCdp) {
  const next = process.argv[cdpIdx + 1];
  if (next && !next.startsWith('-')) {
    cdpEndpoint = next;
  }
  if (!cdpEndpoint) {
    cdpEndpoint = process.env.MIDSCENE_CDP_ENDPOINT;
  }
  if (!cdpEndpoint) {
    console.error(
      'CDP endpoint is required. Provide it as: --cdp <ws-endpoint> or set MIDSCENE_CDP_ENDPOINT environment variable.',
    );
    process.exit(1);
  }
}

// Filter out --bridge, --cdp, and cdp endpoint from argv using absolute indices
const bridgeIdx = process.argv.indexOf('--bridge');
const cdpValueIdx =
  cdpIdx !== -1 &&
  cdpIdx + 1 < process.argv.length &&
  !process.argv[cdpIdx + 1].startsWith('-')
    ? cdpIdx + 1
    : -1;
const skipIndices = new Set(
  [bridgeIdx, cdpIdx, cdpValueIdx].filter((i) => i !== -1),
);
const argv = process.argv
  .slice(2)
  .filter((_, idx) => !skipIndices.has(idx + 2));

let tools: WebMidsceneTools | WebPuppeteerMidsceneTools | WebCdpMidsceneTools;
if (isBridge) {
  tools = new WebMidsceneTools();
} else if (isCdp) {
  tools = new WebCdpMidsceneTools(cdpEndpoint!);
} else {
  tools = new WebPuppeteerMidsceneTools();
}

const splitReportCommand: CLIExtraCommand = {
  name: 'split-report',
  def: {
    name: 'split-report',
    description:
      'Split Midscene report HTML into per-execution JSON files and externalized screenshots.',
    schema: {
      htmlPath: z
        .string()
        .describe('Input report HTML path (e.g. ./report/index.html)'),
      outputDir: z
        .string()
        .describe('Output directory for *.execution.json and screenshots/'),
    },
    handler: async (args) => {
      const { htmlPath, outputDir } = args as {
        htmlPath?: string;
        outputDir?: string;
      };

      if (!htmlPath) {
        throw new Error('split-report: --htmlPath is required');
      }
      if (!outputDir) {
        throw new Error('split-report: --outputDir is required');
      }

      const result = splitReportHtmlByExecution({ htmlPath, outputDir });
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `Split completed. Generated ${result.executionJsonFiles.length} execution JSON files and ${result.screenshotFiles.length} screenshots.`,
          },
        ],
      };
    },
  },
};

runToolsCLI(tools, 'midscene-web', {
  stripPrefix: 'web_',
  argv,
  version: __VERSION__,
  extraCommands: [splitReportCommand],
}).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
