import type { CommandModule } from 'yargs';
import { type AgentOptions, createPlatformAgent, destroyAgent } from '../agent-factory';
import { loadEnv } from '../cli-utils';
import type { Platform } from '../global-options';

export const connectCommand: CommandModule = {
  command: 'connect',
  describe: 'Start or attach to a session (browser/device)',
  builder: (yargs) => {
    return yargs
      .option('bridge', {
        type: 'boolean',
        default: false,
        description: 'Use Chrome Bridge mode (web only)',
      })
      .option('url', {
        type: 'string',
        description: 'URL to navigate after connecting (web only)',
      })
      .option('device', {
        type: 'string',
        description: 'Device ID (android only)',
      })
      .option('display', {
        type: 'string',
        description: 'Display ID (computer only)',
      })
      .option('headed', {
        type: 'boolean',
        default: false,
        description: 'Run browser in headed mode (web Puppeteer only, default is headless)',
      })
      .example('$0 connect -p web --headed', 'Start a headed browser session')
      .example('$0 connect -p android --device emulator-5554', 'Connect to Android device');
  },
  handler: async (argv) => {
    loadEnv();

    const opts: AgentOptions = {
      platform: (argv.platform as Platform) ?? 'web',
      bridge: (argv.bridge as boolean) ?? false,
      url: argv.url as string | undefined,
      device: argv.device as string | undefined,
      display: argv.display as string | undefined,
      headed: (argv.headed as boolean) ?? false,
    };

    try {
      const agent = await createPlatformAgent(opts.platform, opts);
      destroyAgent(opts.platform, agent, opts.bridge);

      const label = opts.device ? `${opts.platform} (${opts.device})` : opts.platform;
      console.log(`Connected to ${label}`);
      process.exit(0);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  },
};
