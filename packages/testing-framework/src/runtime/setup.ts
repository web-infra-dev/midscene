import { basename } from 'node:path';
import type {
  FrameworkSetupResult,
  MidsceneFrameworkConfig,
  SetupContext,
} from '../types';

interface DefaultSetupContext extends SetupContext {}

/**
 * Core deliberately rejects `cache: true` (it never auto-generates ids). The
 * framework adds the convenience: when a suite sets `cache: true`, derive a
 * stable id from the project folder name so the same cache is reused across
 * runs and users never have to invent one. An explicit `cache: { id }` (or
 * `cache: false`) is left untouched.
 */
const trimEdgeHyphens = (value: string): string => {
  let start = 0;
  let end = value.length;

  while (start < end && value.charCodeAt(start) === 45) {
    start += 1;
  }
  while (end > start && value.charCodeAt(end - 1) === 45) {
    end -= 1;
  }

  return value.slice(start, end);
};

const deriveStableCacheId = (projectDir: string): string =>
  trimEdgeHyphens(basename(projectDir).replace(/[^a-zA-Z0-9._-]+/g, '-')) ||
  'midscene';

const resolveAgentOptions = (
  agentOptions: Record<string, unknown>,
  projectDir: string,
): Record<string, unknown> => {
  if (agentOptions.cache !== true) {
    return agentOptions;
  }
  return {
    ...agentOptions,
    cache: { id: deriveStableCacheId(projectDir) },
  };
};

async function createAndroidSetup(
  config: MidsceneFrameworkConfig,
  context: DefaultSetupContext,
): Promise<FrameworkSetupResult> {
  const { agentFromAdbDevice } = await import('@midscene/android');
  const options = (config.target?.options || {}) as Record<string, unknown>;
  const { deviceId, launch, ...deviceOptions } = options;

  const agent = await agentFromAdbDevice(
    typeof deviceId === 'string' ? deviceId : undefined,
    {
      ...context.agentOptions,
      ...deviceOptions,
    },
  );

  if (typeof launch === 'string' && launch) {
    await agent.launch(launch);
  }

  return {
    agent,
    async teardown() {
      // Only terminate launched apps, not URLs opened in the default browser.
      if (typeof launch === 'string' && launch && !launch.startsWith('http')) {
        await agent.terminate(launch);
      }
    },
  };
}

async function createWebSetup(
  config: MidsceneFrameworkConfig,
  context: DefaultSetupContext,
): Promise<FrameworkSetupResult> {
  const [{ PlaywrightAgent }, { chromium }] = await Promise.all([
    import('@midscene/web/playwright'),
    import('playwright'),
  ]);

  const options = (config.target?.options || {}) as {
    url?: string;
    viewport?: { width: number; height: number };
    headless?: boolean;
  };

  if (!options.url) {
    throw new Error('target.options.url is required for the web target');
  }

  const browser = await chromium.launch({
    headless: options.headless ?? true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const browserContext = await browser.newContext({
    viewport: options.viewport,
  });
  const page = await browserContext.newPage();
  await page.goto(options.url);

  return {
    agent: new PlaywrightAgent(page, context.agentOptions),
    browser,
    context: browserContext,
    page,
    async teardown() {
      await browserContext.close();
      await browser.close();
    },
  };
}

/**
 * Create an agent from the default `target` config. Only the `web` and
 * `android` targets documented for the first version are supported.
 */
export async function createDefaultSetup(
  config: MidsceneFrameworkConfig,
  context: DefaultSetupContext,
): Promise<FrameworkSetupResult> {
  if (!config.target) {
    throw new Error('midscene config must provide "target" or "setup"');
  }

  if (config.target.type === 'android') {
    return createAndroidSetup(config, context);
  }

  if (config.target.type === 'web') {
    return createWebSetup(config, context);
  }

  throw new Error(`Unsupported target.type: ${config.target.type}`);
}

/**
 * Resolve the suite agent. A custom `setup` takes precedence; otherwise the
 * default target setup is used.
 */
export async function setupFrameworkAgent(
  config: MidsceneFrameworkConfig,
  context: DefaultSetupContext,
): Promise<FrameworkSetupResult> {
  // Resolve `cache: true` to a stable id once, so both custom and default
  // setups receive agent options Core will accept.
  const resolvedContext: DefaultSetupContext = {
    ...context,
    agentOptions: resolveAgentOptions(context.agentOptions, context.projectDir),
  };

  if (config.setup) {
    return config.setup(resolvedContext);
  }

  return createDefaultSetup(config, resolvedContext);
}
