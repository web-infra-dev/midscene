import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  MidsceneYamlConfigAttempt,
  MidsceneYamlConfigResult,
  MidsceneYamlScript,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptEnv,
  MidsceneYamlScriptIOSEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import {
  type ScriptPlayer,
  parseYamlScript,
  resolveWebTarget,
} from '@midscene/core/yaml';
import {
  buildChromeArgs,
  buildDownloadBehavior,
  defaultViewportHeight,
  defaultViewportWidth,
} from '@midscene/web/puppeteer-agent-launcher';

import merge from 'lodash.merge';
import pLimit from 'p-limit';
import puppeteer, {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from 'puppeteer';
import { createYamlPlayer } from './create-yaml-player';
import {
  createExecutedYamlResult,
  createNotExecutedYamlResult,
  createYamlAttempt,
  getYamlAttemptsDuration,
  preserveYamlAttemptReport,
  printExecutionFinished,
  printExecutionPlan,
  resolveYamlMaxAttempts,
  writeExecutionSummaryFile,
} from './execution-summary';
import {
  type MidsceneYamlFileContext,
  contextInfo,
  contextTaskListSummary,
  formatYamlProgressSnapshot,
  isTTY,
  spinnerInterval,
} from './printer';
import { TTYWindowRenderer } from './tty-renderer';

export interface BatchRunnerConfig {
  files: string[];
  /**
   * A setup yaml file executed before the main `files`. A setup failure aborts
   * the batch and leaves the main files not executed. Puppeteer Web setup uses
   * `shareBrowserContext` to pass its successful browser state to the main
   * files. Other targets run setup in their own target environment without
   * browser-context sharing.
   */
  setup?: string;
  concurrent: number;
  continueOnError: boolean;
  /**
   * Number of extra attempts for a failed yaml file. The batch executor owns
   * retries so it can re-execute only failed files. Puppeteer Web setup retries
   * receive a clean browser context; other targets receive a new player/Agent
   * while their underlying device or external session may retain state.
   * Main-file retries preserve the successful setup environment. Defaults to 0
   * (no retry).
   */
  retry?: number;
  summary: string;
  /** Share one BrowserContext and Page across Puppeteer Web yaml files. */
  shareBrowserContext: boolean;
  globalConfig?: {
    page?: Partial<MidsceneYamlScriptWebEnv>;
    browser?: Partial<MidsceneYamlScriptWebEnv>;
    web?: Partial<MidsceneYamlScriptWebEnv>;
    android?: Partial<MidsceneYamlScriptAndroidEnv>;
    ios?: Partial<MidsceneYamlScriptIOSEnv>;
    target?: Partial<MidsceneYamlScriptWebEnv>;
  };
  headed: boolean;
  keepWindow: boolean;
  dotenvOverride: boolean;
  dotenvDebug: boolean;
}

interface BatchFileContext {
  file: string;
  sourceConfig: MidsceneYamlScript;
  executionConfig: MidsceneYamlScript;
  outputPath?: string;
  options: {
    headed?: boolean;
    keepWindow?: boolean;
    browser?: Browser;
    page?: Page;
  };
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
 * Structural target errors remain owned by createYamlPlayer, which provides
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

const assertBrowserContextUsage = (
  setupContext: BatchFileContext | undefined,
  allContexts: BatchFileContext[],
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

interface ExecutedBatchFileContext extends MidsceneYamlFileContext {
  duration: number;
  yamlResult: MidsceneYamlConfigResult;
}

interface SharedBrowserRuntime {
  browserContext: BrowserContext;
  page: Page;
}

const createSharedBrowserRuntime = async (
  browser: Browser,
  browserContextOptions?: BrowserContextOptions,
): Promise<SharedBrowserRuntime> => {
  const browserContext = await browser.createBrowserContext(
    browserContextOptions,
  );
  try {
    const page = await browserContext.newPage();
    return { browserContext, page };
  } catch (error) {
    try {
      await browserContext.close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Failed to create and clean up a shared browser runtime',
      );
    }
    throw error;
  }
};

export interface RunYamlBatchOptions {
  generateSummary?: boolean;
  printExecutionPlan?: boolean;
  /**
   * Receives complete, line-oriented progress snapshots. When provided, the
   * caller owns progress delivery and direct terminal rendering is disabled.
   */
  onProgress?: (message: string) => void;
}

class YamlBatchExecutor {
  private config: BatchRunnerConfig;
  private results: MidsceneYamlConfigResult[] = [];

  constructor(config: BatchRunnerConfig) {
    this.config = config;
  }

  async run(
    options: RunYamlBatchOptions = {},
  ): Promise<MidsceneYamlConfigResult[]> {
    const generateSummary = options.generateSummary ?? true;
    const shouldPrintExecutionPlan = options.printExecutionPlan ?? true;
    const { keepWindow, headed } = this.config;
    const setup = this.config.setup;

    // Print execution plan
    if (shouldPrintExecutionPlan) {
      printExecutionPlan(this.config);
    }

    // Prepare file contexts
    let setupContext: BatchFileContext | undefined;
    const fileContextList: BatchFileContext[] = [];
    let browser: Browser | null = null;
    const sharedRuntime = { current: null as SharedBrowserRuntime | null };

    try {
      // Create the setup context (prerequisite) before the main files so the
      // TTY plan lists it first and its successful state can be handed off.
      if (setup) {
        const fileConfig = await this.loadFileConfig(setup);
        setupContext = await this.createFileContext(setup, fileConfig, {
          headed,
          keepWindow,
        });
      }

      // First, create all file contexts without a browser instance
      for (const file of this.config.files) {
        const fileConfig = await this.loadFileConfig(file);
        const context = await this.createFileContext(file, fileConfig, {
          headed,
          keepWindow,
        });
        fileContextList.push(context);
      }

      // A yaml file cannot be both the setup and a main file: players are keyed
      // by resolved path, so the same file in both roles would silently reuse
      // one already-finished player. Reject the overlap explicitly instead.
      if (setupContext) {
        const setupPath = resolve(setupContext.file);
        const conflict = fileContextList.find(
          (ctx) => resolve(ctx.file) === setupPath,
        );
        if (conflict) {
          throw new Error(
            `"${conflict.file}" is used as both the setup file and a main file; a yaml file cannot be both`,
          );
        }
      }

      const allContexts = setupContext
        ? [setupContext, ...fileContextList]
        : fileContextList;

      assertBrowserContextUsage(
        setupContext,
        allContexts,
        this.config.shareBrowserContext,
      );

      // Now, check if any of the tasks require a web browser
      const needsBrowser = allContexts.some(
        (ctx) => typeof resolveWebTarget(ctx.executionConfig) !== 'undefined',
      );
      let resetSetupRuntime: (() => Promise<void>) | undefined;

      if (needsBrowser && this.config.shareBrowserContext) {
        const globalWebConfig = resolveWebTarget(
          this.config.globalConfig ?? {},
        )?.target;
        const downloadBehavior = buildDownloadBehavior(
          globalWebConfig?.downloadPath,
        );
        const browserContextOptions = downloadBehavior
          ? { downloadBehavior }
          : undefined;

        if (globalWebConfig?.cdpEndpoint) {
          // CDP mode: connect to an existing browser
          browser = await puppeteer.connect({
            browserWSEndpoint: globalWebConfig.cdpEndpoint,
            defaultViewport: null,
            downloadBehavior,
          });
        } else {
          // Extract viewport dimensions from global config or use defaults
          // This should match the logic in launchPuppeteerPage
          const width = globalWebConfig?.viewportWidth ?? defaultViewportWidth;
          const height =
            globalWebConfig?.viewportHeight ?? defaultViewportHeight;

          const args = buildChromeArgs({
            userAgent: globalWebConfig?.userAgent,
            // Only pass windowSize in headed mode; in headless mode, defaultViewport takes precedence
            windowSize: headed ? { width, height } : undefined,
            chromeArgs: globalWebConfig?.chromeArgs,
          });

          browser = await puppeteer.launch({
            headless: !headed,
            defaultViewport: headed ? null : { width, height },
            downloadBehavior,
            args,
            acceptInsecureCerts: globalWebConfig?.acceptInsecureCerts,
          });
        }

        resetSetupRuntime = async () => {
          if (!browser) {
            throw new Error('Cannot create a shared runtime without a browser');
          }

          if (sharedRuntime.current) {
            const staleRuntime = sharedRuntime.current;
            sharedRuntime.current = null;
            await staleRuntime.browserContext.close();
          }

          sharedRuntime.current = await createSharedBrowserRuntime(
            browser,
            browserContextOptions,
          );
          for (const context of allContexts) {
            context.options.browser = browser;
            context.options.page = sharedRuntime.current.page;
          }
        };

        await resetSetupRuntime();
      }

      // A failed setup attempt replaces the shared runtime; main-file retries
      // keep using the successful setup runtime.
      const { executedResults, notExecutedContexts } = await this.executeFiles(
        setupContext,
        fileContextList,
        {
          onProgress: options.onProgress,
          resetSetupRuntime,
        },
      );

      this.results = await this.processResults(
        executedResults,
        notExecutedContexts,
      );
    } finally {
      if (browser && !this.config.keepWindow) {
        try {
          if (sharedRuntime.current) {
            await sharedRuntime.current.browserContext.close();
            sharedRuntime.current = null;
          }
        } finally {
          // For CDP mode, disconnect instead of closing the externally managed browser.
          const isCdp = !!resolveWebTarget(this.config.globalConfig ?? {})
            ?.target.cdpEndpoint;
          if (isCdp) {
            browser.disconnect();
          } else {
            await browser.close();
          }
        }
      }
      if (generateSummary) {
        await this.generateOutputIndex();
      }
    }

    return this.results;
  }

  private async createFileContext(
    file: string,
    fileConfig: MidsceneYamlScript,
    options: { headed?: boolean; keepWindow?: boolean; browser?: Browser },
  ): Promise<BatchFileContext> {
    const { globalConfig } = this.config;

    // Deep clone to avoid mutation
    const clonedFileConfig = JSON.parse(JSON.stringify(fileConfig));

    // Start with the file's config, then merge the global config from the index file,
    // which has already been merged with command-line options.
    const executionConfig = merge(clonedFileConfig, globalConfig);

    return {
      file,
      sourceConfig: fileConfig,
      executionConfig,
      options,
    };
  }

  private async executeFiles(
    setupContext: BatchFileContext | undefined,
    fileContextList: BatchFileContext[],
    options: {
      onProgress?: (message: string) => void;
      resetSetupRuntime?: () => Promise<void>;
    },
  ): Promise<{
    executedResults: ExecutedBatchFileContext[];
    notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv> | null;
    }>;
  }> {
    const { onProgress, resetSetupRuntime } = options;
    const executedResults: ExecutedBatchFileContext[] = [];
    const notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv> | null;
    }> = [];

    // Create the setup player first. Main-file players are deferred until the
    // setup succeeds so they never retain a page from a discarded setup attempt.
    const allFileContexts: MidsceneYamlFileContext[] = [];
    const createFilePlayerContext = async (
      context: BatchFileContext,
    ): Promise<MidsceneYamlFileContext> => ({
      file: context.file,
      player: await createYamlPlayer(
        context.file,
        context.executionConfig,
        context.options,
      ),
    });
    const initialContexts = setupContext ? [setupContext] : fileContextList;
    for (const context of initialContexts) {
      allFileContexts.push(await createFilePlayerContext(context));
    }

    // Setup TTY renderer
    let ttyRenderer: TTYWindowRenderer | undefined;
    if (isTTY && !onProgress) {
      const summaryContents = () => {
        const summary: string[] = [''];
        for (const context of allFileContexts) {
          summary.push(
            contextTaskListSummary(context.player.taskStatusList, context),
          );
        }
        summary.push('');
        return summary;
      };
      ttyRenderer = new TTYWindowRenderer({
        outputStream: process.stdout,
        errorStream: process.stderr,
        getWindow: summaryContents,
        interval: spinnerInterval,
      });
      ttyRenderer.start();
    }

    const reportProgressSnapshot = (
      context: MidsceneYamlFileContext,
      attempt: number,
      totalAttempts: number,
    ) => {
      const summary = contextTaskListSummary(
        context.player.taskStatusList,
        context,
      );
      onProgress?.(formatYamlProgressSnapshot(summary, attempt, totalAttempts));
    };

    try {
      // Helper function to execute a single file
      const executeFile = async (
        context: BatchFileContext,
        beforeRetry?: () => Promise<void>,
      ): Promise<ExecutedBatchFileContext> => {
        // Find the corresponding player in allFileContexts
        const allFileContext = allFileContexts.find(
          (c) => c.file === context.file,
        );
        if (!allFileContext) {
          throw new Error(`Player not found for file: ${context.file}`);
        }

        const totalAttempts = resolveYamlMaxAttempts(this.config.retry);
        const attempts: MidsceneYamlConfigAttempt[] = [];
        let executedContext: ExecutedBatchFileContext | undefined;

        for (let attempt = 1; attempt <= totalAttempts; attempt++) {
          if (attempt > 1) {
            if (context.executionConfig.agent?.reportFileName) {
              attempts[attempts.length - 1] = preserveYamlAttemptReport(
                attempts[attempts.length - 1],
              );
            }
            await beforeRetry?.();
            allFileContext.player = await createYamlPlayer(
              context.file,
              context.executionConfig,
              context.options,
            );
          }

          if (onProgress) {
            reportProgressSnapshot(allFileContext, attempt, totalAttempts);
          } else if (!isTTY) {
            const { mergedText } = contextInfo(allFileContext);
            console.log(mergedText);
          }

          if (context.outputPath) {
            allFileContext.player.output = context.outputPath;
          }

          const startTime = Date.now();
          await allFileContext.player.run();
          const duration = Date.now() - startTime;
          const attemptResult = createExecutedYamlResult({
            file: context.file,
            player: allFileContext.player,
            duration,
          });
          attempts.push(createYamlAttempt(attemptResult, attempt));
          const totalDuration = getYamlAttemptsDuration(attempts);

          const yamlResult: MidsceneYamlConfigResult = {
            ...attemptResult,
            duration: totalDuration,
            attempts: [...attempts],
          };
          executedContext = {
            file: context.file,
            player: allFileContext.player,
            duration: totalDuration,
            yamlResult,
          };

          if (onProgress) {
            reportProgressSnapshot(executedContext, attempt, totalAttempts);
          } else if (!isTTY) {
            console.log(
              contextTaskListSummary(
                allFileContext.player.taskStatusList,
                executedContext,
              ),
            );
          }

          if (yamlResult.success) break;
        }

        if (!executedContext) {
          throw new Error(`No attempts executed for file: ${context.file}`);
        }
        return executedContext;
      };

      // Run the setup file first, if any. A setup failure aborts the batch:
      // every main file is marked as not executed. This holds regardless of
      // `continueOnError`, since the main files rely on the prerequisite state
      // the setup file establishes.
      let setupFailed = false;
      if (setupContext) {
        const executedContext = await executeFile(
          setupContext,
          resetSetupRuntime,
        );
        executedResults.push(executedContext);
        setupFailed = !executedContext.yamlResult.success;
      }

      if (setupFailed) {
        for (const context of fileContextList) {
          notExecutedContexts.push({ file: context.file, player: null });
        }
      } else {
        if (setupContext) {
          for (const context of fileContextList) {
            allFileContexts.push(await createFilePlayerContext(context));
          }
        }
        // Execute based on concurrency and error handling settings
        await this.executeConcurrently(
          fileContextList,
          executeFile,
          executedResults,
          notExecutedContexts,
        );
      }

      // Print final summary for non-TTY mode
      if (!isTTY && !onProgress) {
        console.log('\n📋 Execution Results:');
        for (const context of executedResults) {
          console.log(
            contextTaskListSummary(context.player.taskStatusList, context),
          );
        }
      }
    } finally {
      if (ttyRenderer) {
        ttyRenderer.stop();
      }
    }

    return { executedResults, notExecutedContexts };
  }

  private async executeConcurrently(
    fileContextList: BatchFileContext[],
    executeFile: (
      context: BatchFileContext,
    ) => Promise<ExecutedBatchFileContext>,
    executedResults: ExecutedBatchFileContext[],
    notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv> | null;
    }>,
  ): Promise<void> {
    const limit = pLimit(this.config.concurrent);

    if (this.config.continueOnError) {
      // Execute all tasks with concurrency
      const tasks = fileContextList.map((context) =>
        limit(async () => {
          const executedContext = await executeFile(context);
          executedResults.push(executedContext);
        }),
      );
      await Promise.allSettled(tasks);
    } else {
      // Execute with concurrency but stop new tasks when failure occurs
      let shouldStop = false;
      const stopLock = { value: false };

      const tasks = fileContextList.map((context) =>
        limit(async () => {
          if (stopLock.value) {
            notExecutedContexts.push({
              file: context.file,
              player: null,
            });
            return;
          }

          const executedContext = await executeFile(context);
          executedResults.push(executedContext);

          if (!executedContext.yamlResult.success && !stopLock.value) {
            stopLock.value = true;
            shouldStop = true;
          }
        }),
      );

      await Promise.allSettled(tasks);

      // Handle not executed contexts
      if (shouldStop) {
        for (const context of fileContextList) {
          if (
            !executedResults.some((r) => r.file === context.file) &&
            !notExecutedContexts.some((ctx) => ctx.file === context.file)
          ) {
            notExecutedContexts.push({ file: context.file, player: null });
          }
        }
      }
    }
  }

  private async processResults(
    executedContexts: ExecutedBatchFileContext[],
    notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv> | null;
    }>,
  ): Promise<MidsceneYamlConfigResult[]> {
    const results: MidsceneYamlConfigResult[] = [];

    for (const context of executedContexts) {
      results.push(context.yamlResult);
    }

    for (const context of notExecutedContexts) {
      results.push(createNotExecutedYamlResult(context.file));
    }

    return results;
  }

  private async loadFileConfig(file: string): Promise<MidsceneYamlScript> {
    const content = readFileSync(file, 'utf8');
    return parseYamlScript(content, file);
  }

  private async generateOutputIndex(): Promise<void> {
    try {
      writeExecutionSummaryFile(this.config.summary, this.results);
      printExecutionFinished();
    } catch (error) {
      console.error('Failed to generate output index:', error);
    }
  }
}

export async function runYamlBatch(
  config: BatchRunnerConfig,
  options: RunYamlBatchOptions = {},
): Promise<MidsceneYamlConfigResult[]> {
  return new YamlBatchExecutor(config).run(options);
}
