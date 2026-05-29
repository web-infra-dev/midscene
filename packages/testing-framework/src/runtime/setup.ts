import type {
  FrameworkSetupResult,
  MidsceneFrameworkConfig,
  SetupContext,
} from '../types';

interface DefaultSetupContext extends SetupContext {}

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
  if (config.setup) {
    return config.setup(context);
  }

  return createDefaultSetup(config, context);
}
