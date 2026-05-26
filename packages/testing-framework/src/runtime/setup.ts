import type { FrameworkSetupResult, MidsceneFrameworkConfig } from '../types';

export async function createDefaultSetup(
  config: MidsceneFrameworkConfig,
): Promise<FrameworkSetupResult> {
  if (!config.target) {
    throw new Error('midscene.config.ts must provide target or setup');
  }

  const options = config.target.options || {};
  if (config.target.type === 'android') {
    const { agentFromAdbDevice } = await import('@midscene/android');
    const { deviceId, launch, ...deviceOptions } = options as Record<
      string,
      unknown
    >;
    const agent = await agentFromAdbDevice(
      typeof deviceId === 'string' ? deviceId : undefined,
      {
        ...config.agentOptions,
        ...deviceOptions,
      },
    );

    if (typeof launch === 'string' && launch) {
      await agent.launch(launch);
    }

    return {
      agent,
      async teardown() {
        if (
          typeof launch === 'string' &&
          launch &&
          !launch.startsWith('http')
        ) {
          await agent.terminate(launch);
        }
      },
    };
  }

  if (config.target.type === 'web') {
    const [{ PlaywrightAgent }, { chromium }] = await Promise.all([
      import('@midscene/web/playwright'),
      import('playwright'),
    ]);
    const targetOptions = options as {
      url?: string;
      viewport?: { width: number; height: number };
      headless?: boolean;
    };
    if (!targetOptions.url) {
      throw new Error('target.options.url is required for web target');
    }

    const browser = await chromium.launch({
      headless: targetOptions.headless ?? true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({
      viewport: targetOptions.viewport,
    });
    const page = await context.newPage();
    await page.goto(targetOptions.url);

    return {
      agent: new PlaywrightAgent(page, config.agentOptions),
      browser,
      context,
      page,
      async teardown() {
        await context.close();
        await browser.close();
      },
    };
  }

  throw new Error(`Unsupported target.type: ${config.target.type}`);
}

export async function setupFrameworkAgent(
  config: MidsceneFrameworkConfig,
): Promise<FrameworkSetupResult> {
  if (config.setup) {
    return config.setup({
      agentOptions: config.agentOptions || {},
    });
  }

  return createDefaultSetup(config);
}
