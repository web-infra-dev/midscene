import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CLIError, runToolsCLI } from '@midscene/shared/cli';
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
const hasCdpFlag = cdpIdx !== -1;

// Parse --cdp endpoint value or auto-detect from env var
let cdpEndpoint: string | undefined;
if (hasCdpFlag) {
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
} else if (!isBridge && process.env.MIDSCENE_CDP_ENDPOINT) {
  // Auto-detect CDP mode from environment variable
  cdpEndpoint = process.env.MIDSCENE_CDP_ENDPOINT;
}

const isCdp = !!cdpEndpoint;

// Fail-fast: mutually exclusive flags
if (isBridge && isCdp) {
  console.error(
    '--bridge and --cdp are mutually exclusive. Please specify only one.',
  );
  process.exit(1);
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

runToolsCLI(tools, 'midscene-web', {
  stripPrefix: 'web_',
  argv,
  version: __VERSION__,
}).catch((e) => {
  if (!(e instanceof CLIError)) console.error(e);
  process.exit(e instanceof CLIError ? e.exitCode : 1);
});
