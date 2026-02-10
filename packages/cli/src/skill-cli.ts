import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import dotenv from 'dotenv';

type Platform = 'computer' | 'web' | 'android' | 'ios';
type Command =
  | 'act'
  | 'query'
  | 'assert'
  | 'screenshot'
  | 'navigate'
  | 'close'
  | 'connect'
  | 'displays';

interface SkillResult {
  success: boolean;
  message?: string;
  result?: unknown;
  screenshot?: string;
  error?: string;
}

function printResult(result: SkillResult) {
  console.log(JSON.stringify(result, null, 2));
}

async function saveScreenshot(base64: string): Promise<string> {
  const dir = join(tmpdir(), 'midscene-screenshots');
  await mkdir(dir, { recursive: true });
  const filename = `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const filepath = join(dir, filename);

  // base64 may have data URI prefix
  const raw = base64.replace(/^data:image\/\w+;base64,/, '');
  await writeFile(filepath, Buffer.from(raw, 'base64'));
  return filepath;
}

async function createPlatformAgent(
  platform: Platform,
  opts: {
    bridge?: boolean;
    url?: string;
    device?: string;
    display?: string;
  },
) {
  switch (platform) {
    case 'computer': {
      const { agentFromComputer } = await import('@midscene/computer');
      return agentFromComputer(
        opts.display ? { displayId: opts.display } : undefined,
      );
    }
    case 'web': {
      if (opts.bridge) {
        const { AgentOverChromeBridge } = await import(
          '@midscene/web/bridge-mode'
        );
        const agent = new AgentOverChromeBridge({ closeConflictServer: true });
        if (opts.url) {
          await agent.connectNewTabWithUrl(opts.url);
        } else {
          await agent.connectCurrentTab();
        }
        return agent;
      }
      const { puppeteerAgentForTarget } = await import(
        '@midscene/web/puppeteer-agent-launcher'
      );
      const { agent } = await puppeteerAgentForTarget(
        opts.url ? { url: opts.url } : ({} as any),
        { headed: true },
      );
      return agent;
    }
    case 'android': {
      const { agentFromAdbDevice } = await import('@midscene/android');
      return agentFromAdbDevice(opts.device);
    }
    case 'ios': {
      const { agentFromWebDriverAgent } = await import('@midscene/ios');
      return agentFromWebDriverAgent();
    }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

async function handleSkillCommand(
  platform: Platform,
  command: Command,
  args: string | undefined,
  opts: {
    bridge?: boolean;
    device?: string;
    display?: string;
  },
): Promise<SkillResult> {
  // For navigate, we need to create agent with the URL
  const agentOpts = {
    ...opts,
    url: command === 'navigate' ? args : undefined,
  };

  // Special commands that don't need full agent lifecycle
  if (platform === 'computer' && command === 'displays') {
    const { ComputerDevice } = await import('@midscene/computer');
    const displays = await ComputerDevice.listDisplays();
    return {
      success: true,
      result: displays,
      message: `Found ${displays.length} display(s)`,
    };
  }

  const agent = await createPlatformAgent(platform, agentOpts);

  try {
    switch (command) {
      case 'act': {
        if (!args) throw new Error('act command requires an action description');
        await agent.aiAction(args);
        const screenshot = await agent.page?.screenshotBase64?.();
        const screenshotPath = screenshot
          ? await saveScreenshot(screenshot)
          : undefined;
        return {
          success: true,
          message: `Action performed: ${args}`,
          screenshot: screenshotPath,
        };
      }

      case 'query': {
        if (!args) throw new Error('query command requires a query string');
        const result = await agent.aiQuery(args);
        const screenshot = await agent.page?.screenshotBase64?.();
        const screenshotPath = screenshot
          ? await saveScreenshot(screenshot)
          : undefined;
        return {
          success: true,
          result,
          message: `Query completed: ${args}`,
          screenshot: screenshotPath,
        };
      }

      case 'assert': {
        if (!args) throw new Error('assert command requires a condition');
        try {
          await agent.aiAssert(args);
          return { success: true, message: `Assertion passed: ${args}` };
        } catch (e: any) {
          return {
            success: false,
            message: `Assertion failed: ${args}`,
            error: e.message,
          };
        }
      }

      case 'screenshot': {
        const screenshot = await agent.page?.screenshotBase64?.();
        if (!screenshot) {
          return { success: false, error: 'Screenshot not available' };
        }
        const screenshotPath = await saveScreenshot(screenshot);
        return {
          success: true,
          message: 'Screenshot captured',
          screenshot: screenshotPath,
        };
      }

      case 'navigate': {
        // Agent was already created with the URL for web platform
        const screenshot = await agent.page?.screenshotBase64?.();
        const screenshotPath = screenshot
          ? await saveScreenshot(screenshot)
          : undefined;
        return {
          success: true,
          message: `Navigated to: ${args}`,
          screenshot: screenshotPath,
        };
      }

      case 'close': {
        await agent.destroy();
        return { success: true, message: 'Agent destroyed' };
      }

      case 'connect': {
        // Agent was already created/connected above
        const screenshot = await agent.page?.screenshotBase64?.();
        const screenshotPath = screenshot
          ? await saveScreenshot(screenshot)
          : undefined;
        return {
          success: true,
          message: `Connected to ${platform}`,
          screenshot: screenshotPath,
        };
      }

      default:
        throw new Error(
          `Unknown command: ${command} for platform: ${platform}`,
        );
    }
  } finally {
    // Destroy agent after command (unless it was a close command)
    if (command !== 'close') {
      try {
        await agent.destroy();
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

function printUsage() {
  console.log(`
Usage: midscene skill <platform> <command> [args] [options]

Platforms:
  computer    Desktop automation (macOS)
  web         Browser automation (Puppeteer or Bridge mode)
  android     Android device automation
  ios         iOS device automation

Commands:
  act "<action>"       Perform an action described in natural language
  query "<query>"      Extract information from current screen/page
  assert "<condition>" Verify a condition on current screen/page
  screenshot           Capture screenshot
  navigate "<url>"     Navigate to URL (web only)
  close                Close/destroy the agent
  connect              Connect to device/browser
  displays             List available displays (computer only)

Options:
  --bridge             Use Chrome Bridge mode instead of Puppeteer (web only)
  --device <id>        Specify device ID (android only)
  --display <id>       Specify display ID (computer only)

Examples:
  midscene skill computer screenshot
  midscene skill computer act "press Cmd+Space to open Spotlight"
  midscene skill web navigate "https://example.com"
  midscene skill web navigate "https://example.com" --bridge
  midscene skill web act "click the login button"
  midscene skill android screenshot
  midscene skill ios act "tap the search field"
`);
}

export async function runSkillCli(argv: string[]) {
  // Load .env if present
  const dotEnvFile = join(process.cwd(), '.env');
  if (existsSync(dotEnvFile)) {
    dotenv.config({ path: dotEnvFile });
  }

  // Parse: skill <platform> <command> [args] [--options]
  // argv comes as everything after "skill"
  const platform = argv[0] as Platform;
  const command = argv[1] as Command;

  if (!platform || !command) {
    printUsage();
    process.exit(1);
  }

  const validPlatforms: Platform[] = ['computer', 'web', 'android', 'ios'];
  if (!validPlatforms.includes(platform)) {
    console.error(`Invalid platform: ${platform}`);
    printUsage();
    process.exit(1);
  }

  // Collect args and options
  let args: string | undefined;
  const opts: { bridge?: boolean; device?: string; display?: string } = {};
  let i = 2;
  while (i < argv.length) {
    const token = argv[i];
    if (token === '--bridge') {
      opts.bridge = true;
    } else if (token === '--device' && argv[i + 1]) {
      opts.device = argv[++i];
    } else if (token === '--display' && argv[i + 1]) {
      opts.display = argv[++i];
    } else if (!token.startsWith('--')) {
      args = token;
    }
    i++;
  }

  try {
    const result = await handleSkillCommand(platform, command, args, opts);
    printResult(result);
    if (!result.success) {
      process.exit(1);
    }
    process.exit(0);
  } catch (e: any) {
    printResult({
      success: false,
      error: e.message || String(e),
    });
    process.exit(1);
  }
}
