import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
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
import { getDebug } from '@midscene/shared/logger';
import {
  buildChromeArgs,
  buildDownloadBehavior,
  captureSessionStorageSnapshot,
  defaultViewportHeight,
  defaultViewportWidth,
} from '@midscene/web/puppeteer-agent-launcher';

import merge from 'lodash.merge';
import pLimit from 'p-limit';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import {
  type CreateYamlPlayerOptions,
  createYamlPlayer,
} from './create-yaml-player';
import {
  createExecutedYamlResult,
  createNotExecutedYamlResult,
  isYamlPlayerSuccessful,
  printExecutionFinished,
  printExecutionPlan,
  writeExecutionSummaryFile,
} from './execution-summary';
import {
  type MidsceneYamlFileContext,
  contextInfo,
  contextTaskListSummary,
  isTTY,
  spinnerInterval,
} from './printer';
import { TTYWindowRenderer } from './tty-renderer';

const batchWarning = getDebug('yaml-batch-executor', { console: true });

export interface BatchRunnerConfig {
  files: string[];
  /**
   * A setup yaml file executed before the main `files`. It reuses the shared
   * browser context, so any prerequisite state (e.g. a login) is visible to
   * every main file. Serial batches reuse the setup page; parallel batches
   * copy its initial same-origin sessionStorage into isolated task pages. A
   * setup failure aborts the batch and leaves the main files not executed.
   * Only honored when `shareBrowserContext` is true; the config layer rejects
   * other combinations.
   */
  setup?: string;
  concurrent: number;
  continueOnError: boolean;
  /**
   * Number of extra attempts for a failed yaml file. Mapped to Rstest's
   * `retry` option, so only the cases that failed in the previous attempt
   * are re-executed. Defaults to 0 (no retry).
   */
  retry?: number;
  summary: string;
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
  executionConfig: MidsceneYamlScript;
  outputPath?: string;
  options: CreateYamlPlayerOptions;
}

export interface RunYamlBatchOptions {
  generateSummary?: boolean;
  printExecutionPlan?: boolean;
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

    // The setup file relies on the shared browser context to hand prerequisite
    // state to the main files. Enforce that invariant here too, so the executor
    // stays correct even if it is constructed directly, bypassing the config
    // layer.
    if (setup && !this.config.shareBrowserContext) {
      throw new Error(
        'setup requires shareBrowserContext: true, otherwise the setup state cannot be shared with the main files',
      );
    }

    // Print execution plan
    if (shouldPrintExecutionPlan) {
      printExecutionPlan(this.config);
    }

    // Prepare file contexts
    let setupContext: BatchFileContext | undefined;
    const fileContextList: BatchFileContext[] = [];
    let browser: Browser | null = null;

    try {
      // Create the setup context (prerequisite) before the main files so the
      // TTY plan lists it first and it reuses the same browser context.
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

      // Now, check if any of the tasks require a web browser
      const needsBrowser = allContexts.some(
        (ctx) => typeof resolveWebTarget(ctx.executionConfig) !== 'undefined',
      );

      if (needsBrowser && this.config.shareBrowserContext) {
        const globalWebConfig = resolveWebTarget(
          this.config.globalConfig ?? {},
        )?.target;

        if (globalWebConfig?.cdpEndpoint) {
          // CDP mode: connect to an existing browser
          browser = await puppeteer.connect({
            browserWSEndpoint: globalWebConfig.cdpEndpoint,
            defaultViewport: null,
            downloadBehavior: buildDownloadBehavior(
              globalWebConfig.downloadPath,
            ),
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
            downloadBehavior: buildDownloadBehavior(
              globalWebConfig?.downloadPath,
            ),
            args,
            acceptInsecureCerts: globalWebConfig?.acceptInsecureCerts,
          });
        }

        // Share the browser context, not the page. Each YAML receives its own
        // page when it starts so concurrent tasks cannot navigate or mutate one
        // another's DOM. Cookies and origin storage remain shared by Chromium.
        for (const context of allContexts) {
          context.options.browser = browser;
        }
      }

      // Execute files
      const { executedResults, notExecutedContexts } = await this.executeFiles(
        setupContext,
        fileContextList,
      );

      // Process results
      this.results = await this.processResults(
        executedResults,
        notExecutedContexts,
      );
    } finally {
      if (browser && !this.config.keepWindow) {
        // For CDP mode, disconnect instead of closing the externally managed browser
        const isCdp = !!resolveWebTarget(this.config.globalConfig ?? {})?.target
          .cdpEndpoint;
        if (isCdp) {
          browser.disconnect();
        } else {
          await browser.close();
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
      executionConfig,
      options,
    };
  }

  private async executeFiles(
    setupContext: BatchFileContext | undefined,
    fileContextList: BatchFileContext[],
  ): Promise<{
    executedResults: Array<MidsceneYamlFileContext & { duration: number }>;
    notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv> | null;
    }>;
  }> {
    const executedResults: Array<
      MidsceneYamlFileContext & { duration: number }
    > = [];
    const notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv> | null;
    }> = [];

    // Pre-create all player contexts for displaying task lists. The setup file
    // comes first so the rendered plan reflects the setup-then-parallel order.
    const allFileContexts: MidsceneYamlFileContext[] = [];
    const orderedContexts = setupContext
      ? [setupContext, ...fileContextList]
      : fileContextList;
    for (const context of orderedContexts) {
      // Create a ScriptPlayer that will be used for actual execution
      const player = await createYamlPlayer(
        context.file,
        context.executionConfig,
        context.options,
      );
      allFileContexts.push({
        file: context.file,
        player,
      });
    }

    // Setup TTY renderer
    let ttyRenderer: TTYWindowRenderer | undefined;
    if (isTTY) {
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

    let serialSharedPage: Page | undefined;
    let batchExecutionFailed = false;
    try {
      // Preserve the legacy serial behavior: one shared page carries
      // page-scoped state such as sessionStorage from setup through every YAML
      // file. Parallel batches still create one page per YAML because a page
      // cannot safely serve concurrent navigations and interactions.
      serialSharedPage = await this.createSerialSharedPage(orderedContexts);

      // Helper function to execute a single file
      const executeFile = async (
        context: BatchFileContext,
        keepPageOpen = false,
      ): Promise<MidsceneYamlFileContext & { duration: number }> => {
        // Find the corresponding player in allFileContexts
        const allFileContext = allFileContexts.find(
          (c) => c.file === context.file,
        );
        if (!allFileContext) {
          throw new Error(`Player not found for file: ${context.file}`);
        }

        if (!isTTY) {
          const { mergedText } = contextInfo(allFileContext);
          console.log(mergedText);
        }

        // Set output path if specified
        if (context.outputPath) {
          allFileContext.player.output = context.outputPath;
        }

        const ownedPage = await this.createPageForContext(context);
        let executionFailed = false;
        try {
          // Record start time
          const startTime = Date.now();

          // Run the player
          await allFileContext.player.run();

          // Calculate duration
          const endTime = Date.now();
          const duration = endTime - startTime;

          const executedContext: MidsceneYamlFileContext & {
            duration: number;
          } = {
            file: context.file,
            player: allFileContext.player,
            duration,
          };

          if (!isTTY) {
            console.log(
              contextTaskListSummary(
                allFileContext.player.taskStatusList,
                executedContext,
              ),
            );
          }

          return executedContext;
        } catch (error) {
          executionFailed = true;
          throw error;
        } finally {
          if (ownedPage && !keepPageOpen && !this.config.keepWindow) {
            await this.closePage(ownedPage, executionFailed);
          }
        }
      };

      // Run the setup file first, if any. A setup failure aborts the batch:
      // every main file is marked as not executed. This holds regardless of
      // `continueOnError`, since the main files rely on the prerequisite state
      // the setup file establishes.
      let setupFailed = false;
      if (setupContext) {
        let setupExecutionFailed = false;
        try {
          const executedContext = await executeFile(setupContext, true);
          executedResults.push(executedContext);
          setupFailed = !isYamlPlayerSuccessful(executedContext.player);

          if (
            !setupFailed &&
            setupContext.options.page &&
            setupContext.options.page !== serialSharedPage
          ) {
            const sessionStorageSnapshot = await captureSessionStorageSnapshot(
              setupContext.options.page,
            );
            for (const context of fileContextList) {
              context.options.sessionStorageSnapshot = sessionStorageSnapshot;
            }
          }
        } catch (error) {
          setupExecutionFailed = true;
          throw error;
        } finally {
          if (
            setupContext.options.page &&
            setupContext.options.page !== serialSharedPage &&
            !this.config.keepWindow
          ) {
            await this.closePage(
              setupContext.options.page,
              setupExecutionFailed,
            );
          }
        }
      }

      if (setupFailed) {
        for (const context of fileContextList) {
          notExecutedContexts.push({ file: context.file, player: null });
        }
      } else {
        // Execute based on concurrency and error handling settings
        await this.executeConcurrently(
          fileContextList,
          executeFile,
          executedResults,
          notExecutedContexts,
        );
      }

      // Print final summary for non-TTY mode
      if (!isTTY) {
        console.log('\n📋 Execution Results:');
        for (const context of executedResults) {
          console.log(
            contextTaskListSummary(context.player.taskStatusList, context),
          );
        }
      }
    } catch (error) {
      batchExecutionFailed = true;
      throw error;
    } finally {
      if (ttyRenderer) {
        ttyRenderer.stop();
      }
      if (serialSharedPage && !this.config.keepWindow) {
        await this.closePage(serialSharedPage, batchExecutionFailed);
      }
    }

    return { executedResults, notExecutedContexts };
  }

  /**
   * A serial shared-browser batch intentionally reuses one page so page-scoped
   * state remains continuous. Parallel batches cannot share a page safely and
   * continue to allocate an isolated page for each YAML execution.
   */
  private async createSerialSharedPage(
    contexts: BatchFileContext[],
  ): Promise<Page | undefined> {
    if (!this.config.shareBrowserContext || this.config.concurrent !== 1) {
      return undefined;
    }

    const firstWebContext = contexts.find((context) => {
      const webTarget = resolveWebTarget(context.executionConfig)?.target;
      return context.options.browser && webTarget && !webTarget.bridgeMode;
    });
    const browser = firstWebContext?.options.browser;
    if (!browser) {
      return undefined;
    }

    const page = await browser.newPage();
    for (const context of contexts) {
      const webTarget = resolveWebTarget(context.executionConfig)?.target;
      if (
        context.options.browser === browser &&
        webTarget &&
        !webTarget.bridgeMode
      ) {
        context.options.page = page;
      }
    }
    return page;
  }

  /**
   * Create an isolated page for one YAML execution while retaining the shared
   * browser context. The page is created inside the concurrency limiter via
   * executeFile, so the number of live task pages cannot exceed `concurrent`.
   */
  private async createPageForContext(
    context: BatchFileContext,
  ): Promise<Page | undefined> {
    const webTarget = resolveWebTarget(context.executionConfig)?.target;
    if (!context.options.browser || !webTarget || webTarget.bridgeMode) {
      return undefined;
    }

    // A preassigned page belongs to the serial batch and is closed once after
    // all YAML files finish, not after this individual execution.
    if (context.options.page) {
      return undefined;
    }

    const page = await context.options.browser.newPage();
    context.options.page = page;
    return page;
  }

  private async closePage(
    page: Page,
    preservePriorError = false,
  ): Promise<void> {
    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch (error) {
      if (preservePriorError) {
        batchWarning(
          'failed to close a YAML execution page after execution had already failed; preserving the original error',
          error,
        );
        return;
      }
      throw new Error('Failed to close a YAML execution page', {
        cause: error,
      });
    }
  }

  private throwUnexpectedExecutionError(
    settledResults: PromiseSettledResult<void>[],
  ): void {
    const rejected = settledResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (rejected) {
      if (rejected.reason instanceof Error) {
        throw rejected.reason;
      }
      throw new Error('Unexpected YAML execution failure', {
        cause: rejected.reason,
      });
    }
  }

  private async executeConcurrently(
    fileContextList: BatchFileContext[],
    executeFile: (
      context: BatchFileContext,
    ) => Promise<MidsceneYamlFileContext & { duration: number }>,
    executedResults: Array<MidsceneYamlFileContext & { duration: number }>,
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
      const settledResults = await Promise.allSettled(tasks);
      this.throwUnexpectedExecutionError(settledResults);
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

          if (executedContext.player.status === 'error' && !stopLock.value) {
            stopLock.value = true;
            shouldStop = true;
          }
        }),
      );

      const settledResults = await Promise.allSettled(tasks);
      this.throwUnexpectedExecutionError(settledResults);

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
    executedContexts: Array<MidsceneYamlFileContext & { duration: number }>,
    notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv> | null;
    }>,
  ): Promise<MidsceneYamlConfigResult[]> {
    const results: MidsceneYamlConfigResult[] = [];

    for (const context of executedContexts) {
      const { file, player, duration } = context;
      results.push(createExecutedYamlResult({ file, player, duration }));
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
