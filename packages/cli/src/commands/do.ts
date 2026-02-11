import type { CommandModule } from 'yargs';
import { type AgentOptions, captureScreenshot, createPlatformAgent, destroyAgent } from '../agent-factory';
import { loadEnv } from '../cli-utils';
import type { Platform } from '../global-options';

type DoCommand = 'act' | 'query' | 'assert' | 'screenshot' | 'navigate';

interface DoResult {
  success: boolean;
  message?: string;
  result?: unknown;
  screenshot?: string;
  error?: string;
}

async function handleDoCommand(
  command: DoCommand,
  args: string | undefined,
  opts: AgentOptions,
): Promise<DoResult> {
  const agentOpts: AgentOptions = {
    ...opts,
    url: command === 'navigate' ? args : opts.url,
  };

  const agent = await createPlatformAgent(opts.platform, agentOpts);

  try {
    switch (command) {
      case 'act': {
        if (!args) throw new Error('act command requires an action description');
        await agent.aiAction(args);
        return {
          success: true,
          message: `Action performed: ${args}`,
          screenshot: await captureScreenshot(agent),
        };
      }

      case 'query': {
        if (!args) throw new Error('query command requires a query string');
        const result = await agent.aiQuery(args);
        return {
          success: true,
          result,
          message: `Query completed: ${args}`,
          screenshot: await captureScreenshot(agent),
        };
      }

      case 'assert': {
        if (!args) throw new Error('assert command requires a condition');
        try {
          await agent.aiAssert(args);
          return { success: true, message: `Assertion passed: ${args}` };
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          return {
            success: false,
            message: `Assertion failed: ${args}`,
            error: message,
          };
        }
      }

      case 'screenshot': {
        const screenshotPath = await captureScreenshot(agent);
        if (!screenshotPath) {
          return { success: false, error: 'Screenshot not available' };
        }
        return {
          success: true,
          message: 'Screenshot captured',
          screenshot: screenshotPath,
        };
      }

      case 'navigate': {
        return {
          success: true,
          message: `Navigated to: ${args}`,
          screenshot: await captureScreenshot(agent),
        };
      }

      default:
        throw new Error(`Unknown do command: ${command}`);
    }
  } finally {
    destroyAgent(opts.platform, agent, opts.bridge);
  }
}

function printResult(result: DoResult): void {
  if (result.result !== undefined) {
    console.log(JSON.stringify(result.result, null, 2));
  }
  if (result.message) {
    console.log(result.message);
  }
  if (result.screenshot) {
    console.log(`Screenshot after running: ${result.screenshot}`);
  }
  if (result.error) {
    console.error(`Error: ${result.error}`);
  }
}

export const doCommand: CommandModule = {
  command: 'do <command> [args]',
  describe: 'Execute a single atomic operation',
  builder: (yargs) => {
    return yargs
      .positional('command', {
        describe: 'Operation to perform',
        choices: ['act', 'query', 'assert', 'screenshot', 'navigate'] as const,
        demandOption: true,
      })
      .positional('args', {
        describe: 'Arguments for the command (e.g., action text, query, URL)',
        type: 'string',
      })
      .option('bridge', {
        type: 'boolean',
        default: false,
        description: 'Use Chrome Bridge mode (web only)',
      })
      .option('url', {
        type: 'string',
        description: 'URL to navigate or connect to (web only)',
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
      .example('$0 do act "click the login button"', 'Perform an action')
      .example('$0 do screenshot -p computer', 'Take a desktop screenshot')
      .example('$0 do query "what is the page title?"', 'Query page content')
      .example('$0 do navigate "https://example.com"', 'Navigate to URL')
      .example('$0 do navigate "https://example.com" --headed', 'Navigate with visible browser');
  },
  handler: async (argv) => {
    loadEnv();

    const command = argv.command as DoCommand;
    const args = argv.args as string | undefined;
    const opts: AgentOptions = {
      platform: (argv.platform as Platform) ?? 'web',
      bridge: (argv.bridge as boolean) ?? false,
      url: argv.url as string | undefined,
      device: argv.device as string | undefined,
      display: argv.display as string | undefined,
      headed: (argv.headed as boolean) ?? false,
    };

    try {
      const result = await handleDoCommand(command, args, opts);
      printResult(result);
      process.exit(result.success ? 0 : 1);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  },
};
