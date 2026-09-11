import type {
  MidsceneYamlScript,
  MidsceneYamlTargetConfig,
} from '@midscene/core';
import type { ProjectSetupDefinition } from '@midscene/core/internal/test-runner';
import { resolveWebTarget } from '@midscene/core/yaml';
import type { Browser, BrowserContext } from 'puppeteer';
import type { CreateYamlPlayerOptions } from './create-yaml-player';

export interface YamlBatchBrowserInput {
  file: string;
  sourceConfig: MidsceneYamlScript;
  executionConfig: MidsceneYamlScript;
}

type BatchRuntimeTarget =
  | 'puppeteer-web'
  | 'bridge-web'
  | 'android'
  | 'ios'
  | 'harmony'
  | 'computer'
  | 'interface';

const batchRuntimeTargetLabel: Record<BatchRuntimeTarget, string> = {
  'puppeteer-web': 'Puppeteer Web',
  'bridge-web': 'Web bridge mode',
  android: 'Android',
  ios: 'iOS',
  harmony: 'HarmonyOS',
  computer: 'Computer',
  interface: 'Interface',
};

/**
 * Resolve a target only when the script has one unambiguous target family.
 * Structural target errors remain owned by createYamlAgent, which provides
 * the canonical validation messages for missing or conflicting targets.
 */
const resolveBatchRuntimeTarget = (
  config: MidsceneYamlScript,
): BatchRuntimeTarget | undefined => {
  const webTarget = resolveWebTarget(config);
  const targets: BatchRuntimeTarget[] = [];
  if (webTarget) {
    targets.push(webTarget.target.bridgeMode ? 'bridge-web' : 'puppeteer-web');
  }
  if (typeof config.android !== 'undefined') targets.push('android');
  if (typeof config.ios !== 'undefined') targets.push('ios');
  if (typeof config.harmony !== 'undefined') targets.push('harmony');
  if (typeof config.computer !== 'undefined') targets.push('computer');
  if (typeof config.interface !== 'undefined') targets.push('interface');

  return targets.length === 1 ? targets[0] : undefined;
};

export const assertBrowserContextUsage = (
  setupContext: YamlBatchBrowserInput | undefined,
  allContexts: YamlBatchBrowserInput[],
  shareBrowserContext: boolean,
): void => {
  const resolvedTargets = allContexts.map((context) => ({
    context,
    target: resolveBatchRuntimeTarget(context.executionConfig),
  }));

  if (shareBrowserContext) {
    const unsupported = resolvedTargets.find(
      ({ target }) => target && target !== 'puppeteer-web',
    );
    if (unsupported?.target) {
      throw new Error(
        `shareBrowserContext only supports Puppeteer Web targets, but "${unsupported.context.file}" uses ${batchRuntimeTargetLabel[unsupported.target]}. Remove shareBrowserContext or use a Puppeteer Web target.`,
      );
    }

    const browserCreationOptions = [
      'cdpEndpoint',
      'chromeArgs',
      'acceptInsecureCerts',
      'downloadPath',
    ] as const;
    for (const { context, target } of resolvedTargets) {
      if (target !== 'puppeteer-web') continue;
      const fileWebConfig = resolveWebTarget(context.sourceConfig)?.target;
      const misplacedOptions = browserCreationOptions.filter(
        (option) => typeof fileWebConfig?.[option] !== 'undefined',
      );
      if (misplacedOptions.length > 0) {
        throw new Error(
          `shareBrowserContext creates one browser from the batch global config, so browser-level option(s) ${misplacedOptions.map((option) => `"${option}"`).join(', ')} in "${context.file}" would be ignored. Move them to the batch config's global Web target.`,
        );
      }
    }
  }

  if (
    setupContext &&
    !shareBrowserContext &&
    resolveBatchRuntimeTarget(setupContext.executionConfig) === 'puppeteer-web'
  ) {
    throw new Error(
      `Puppeteer Web setup "${setupContext.file}" requires shareBrowserContext: true so its browser state can be shared with the main files.`,
    );
  }
};

export interface YamlBatchBrowserSession {
  readonly options: CreateYamlPlayerOptions;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export interface YamlSharedBrowserContext {
  yamlBrowser: YamlBatchBrowserSession;
}

/** Public Test Project setup for documents that share one browser context. */
export function createYamlSharedBrowserProjectSetup(
  options: {
    globalConfig?: MidsceneYamlTargetConfig;
    headed: boolean;
    keepWindow: boolean;
  },
  createSession = createYamlBatchBrowser,
): ProjectSetupDefinition<YamlSharedBrowserContext> {
  return {
    name: 'yaml shared browser',
    async setup(ctx) {
      const yamlBrowser = await createSession(options);
      ctx.onTeardown(() => yamlBrowser.close());
      return { yamlBrowser };
    },
  };
}

// Legacy setup shares browser state, not an Agent. Each file must retain its
// own Agent options, cache identity and report while borrowing this context.
export async function createYamlBatchBrowser(options: {
  globalConfig?: MidsceneYamlTargetConfig;
  headed: boolean;
  keepWindow: boolean;
}): Promise<YamlBatchBrowserSession> {
  const { default: puppeteer } = await import('puppeteer');
  const {
    buildChromeArgs,
    buildDownloadBehavior,
    defaultViewportHeight,
    defaultViewportWidth,
  } = await import('@midscene/web/puppeteer-agent-launcher');
  const web = resolveWebTarget(options.globalConfig ?? {})?.target;
  const downloadBehavior = buildDownloadBehavior(web?.downloadPath);
  const browser: Browser = web?.cdpEndpoint
    ? await puppeteer.connect({
        browserWSEndpoint: web.cdpEndpoint,
        defaultViewport: null,
        downloadBehavior,
      })
    : await puppeteer.launch({
        headless: !options.headed,
        defaultViewport: options.headed
          ? null
          : {
              width: web?.viewportWidth ?? defaultViewportWidth,
              height: web?.viewportHeight ?? defaultViewportHeight,
            },
        downloadBehavior,
        args: buildChromeArgs({
          userAgent: web?.userAgent,
          windowSize: options.headed
            ? {
                width: web?.viewportWidth ?? defaultViewportWidth,
                height: web?.viewportHeight ?? defaultViewportHeight,
              }
            : undefined,
          chromeArgs: web?.chromeArgs,
        }),
        acceptInsecureCerts: web?.acceptInsecureCerts,
      });
  let context: BrowserContext | undefined;
  const borrowed: CreateYamlPlayerOptions = { browser };
  const session: YamlBatchBrowserSession = {
    options: borrowed,
    async reset() {
      const stale = context;
      context = undefined;
      borrowed.browserContext = undefined;
      await stale?.close();
      context = await browser.createBrowserContext(
        downloadBehavior ? { downloadBehavior } : undefined,
      );
      borrowed.browserContext = context;
    },
    async close() {
      if (options.keepWindow) return;
      const errors: unknown[] = [];
      try {
        await context?.close();
      } catch (error) {
        errors.push(error);
      }
      context = undefined;
      borrowed.browserContext = undefined;
      try {
        if (web?.cdpEndpoint) browser.disconnect();
        else await browser.close();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length)
        throw new AggregateError(errors, 'YAML shared browser cleanup failed');
    },
  };
  try {
    await session.reset();
    return session;
  } catch (error) {
    // Acquisition failure never transfers a usable browser to the caller.
    try {
      if (web?.cdpEndpoint) browser.disconnect();
      else await browser.close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'YAML shared browser setup failed',
      );
    }
    throw error;
  }
}
