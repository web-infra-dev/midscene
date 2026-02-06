import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { PuppeteerAgent } from '@midscene/web/puppeteer';
import { config } from 'dotenv';
import { cleanup, connectAgent, launchAgent } from './agent-factory';
import type { CdpConfig, LaunchConfig } from './types';

interface UserScriptExports {
  run?: () => Promise<void>;
}

config();

let globalAgent: PuppeteerAgent | null = null;

export { cleanup };

process.on('beforeExit', cleanup);

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  cleanup().finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  cleanup().finally(() => process.exit(1));
});

/**
 * Parse CLI arguments to extract agent configuration
 */
function parseAgentConfig(args: string[]): {
  cdp?: CdpConfig;
  launch?: LaunchConfig;
} {
  const { values } = parseArgs({
    args,
    options: {
      headed: { type: 'boolean', default: false },
      url: { type: 'string' },
      viewport: { type: 'string' },
      cdp: { type: 'string' },
      'cdp-url': { type: 'string' }, // alias for cdp
      'api-key': { type: 'string' },
      'tab-url': { type: 'string' },
      'tab-index': { type: 'string' },
    },
    strict: false,
  });

  const cdpEndpoint = (values.cdp || values['cdp-url']) as string | undefined;

  // If CDP endpoint is specified, use connect mode
  if (cdpEndpoint) {
    const cdpConfig: CdpConfig = {
      endpoint: cdpEndpoint,
    };

    if (values['api-key']) {
      cdpConfig.apiKey = values['api-key'] as string;
    }
    if (values['tab-url']) {
      cdpConfig.tabUrl = values['tab-url'] as string;
    }
    if (values['tab-index']) {
      cdpConfig.tabIndex = Number.parseInt(values['tab-index'] as string, 10);
    }

    return { cdp: cdpConfig };
  }

  // Otherwise use launch mode
  const launchConfig: LaunchConfig = {
    headed: values.headed as boolean,
  };

  if (values.url) {
    launchConfig.url = values.url as string;
  }

  if (values.viewport) {
    const match = (values.viewport as string).match(/^(\d+)x(\d+)$/);
    if (match) {
      launchConfig.viewport = {
        width: Number.parseInt(match[1], 10),
        height: Number.parseInt(match[2], 10),
      };
    }
  }

  return { launch: launchConfig };
}

/**
 * Initialize global agent based on CLI arguments
 */
async function initializeAgent(): Promise<PuppeteerAgent> {
  const args = process.argv.slice(2);
  const config = parseAgentConfig(args);

  if (config.cdp) {
    console.log('Connecting to browser via CDP...');
    return await connectAgent(config.cdp);
  }

  console.log('Launching browser...');
  return await launchAgent(config.launch);
}

export async function run(scriptPath?: string): Promise<void> {
  // Find script path from arguments (first non-flag argument)
  let path = scriptPath;
  if (!path) {
    const args = process.argv.slice(2);
    path = args.find((arg) => !arg.startsWith('-'));
  }

  if (!path) {
    throw new Error('Usage: midscene <script.ts> [options]');
  }

  // Initialize agent before loading user script
  globalAgent = await initializeAgent();
  (globalThis as any).agent = globalAgent;

  const absolutePath = resolve(process.cwd(), path);
  const userModule = (await import(absolutePath)) as UserScriptExports;

  if (typeof userModule.run === 'function') {
    await userModule.run();
  }
}

// Auto-run when executed as entry point
run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
