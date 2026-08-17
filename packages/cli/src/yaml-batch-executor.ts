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
  pendingContextTaskListSummary,
  spinnerInterval,
} from './printer';
import { TTYWindowRenderer } from './tty-renderer';

const batchWarning = getDebug('yaml-batch-executor', { console: true });

export interface BatchRunnerConfig {
  files: string[];
  /**
   * A setup yaml file executed before the main `files`. It reuses the shared
   * browser context, so any prerequisite state (e.g. a login) is visible to
   * every main file when that state belongs to the browser context, such as
   * cookies or same-origin localStorage. Page-scoped state such as
   * sessionStorage is isolated because every YAML gets its own page. A setup
   * failure aborts the batch and leaves the main files not executed. Only
   * honored when `shareBrowserContext` is true; the config layer rejects other
   * combinations.
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
  options: Omit<CreateYamlPlayerOptions, 'page'>;
}

interface BatchExecutionRecord {
  context: BatchFileContext;
  player?: ScriptPlayer<MidsceneYamlScriptEnv>;
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

    // Keep display records for every file, but create each ScriptPlayer only
    // after its page exists inside the concurrency slot. This avoids relying on
    // a mutable options object to inject the page after player construction.
    const orderedContexts = setupContext
      ? [setupContext, ...fileContextList]
      : fileContextList;
    const executionRecords: BatchExecutionRecord[] = orderedContexts.map(
      (context) => ({ context }),
    );
    const executionRecordByContext = new Map(
      executionRecords.map((record) => [record.context, record]),
    );

    // Setup TTY renderer
    let ttyRenderer: TTYWindowRenderer | undefined;
    if (isTTY) {
      const summaryContents = () => {
        const summary: string[] = [''];
        for (const record of executionRecords) {
          if (record.player) {
            const fileContext = {
              file: record.context.file,
              player: record.player,
            };
            summary.push(
              contextTaskListSummary(record.player.taskStatusList, fileContext),
            );
          } else {
            summary.push(
              pendingContextTaskListSummary(
                record.context.file,
                record.context.executionConfig.tasks,
              ),
            );
          }
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

    try {
      // Helper function to execute a single file
      const executeFile = async (
        context: BatchFileContext,
      ): Promise<MidsceneYamlFileContext & { duration: number }> => {
        const executionRecord = executionRecordByContext.get(context);
        if (!executionRecord) {
          throw new Error(
            `Execution record not found for file: ${context.file}`,
          );
        }

        let ownedPage: Page | undefined;
        let executionFailed = false;
        try {
          ownedPage = await this.createPageForContext(context);
          const player = await createYamlPlayer(
            context.file,
            context.executionConfig,
            {
              ...context.options,
              page: ownedPage,
            },
          );
          executionRecord.player = player;

          const fileContext: MidsceneYamlFileContext = {
            file: context.file,
            player,
          };

          if (!isTTY) {
            const { mergedText } = contextInfo(fileContext);
            console.log(mergedText);
          }

          if (context.outputPath) {
            player.output = context.outputPath;
          }

          // Record start time
          const startTime = Date.now();

          // Run the player
          await player.run();

          // Calculate duration
          const endTime = Date.now();
          const duration = endTime - startTime;

          const executedContext: MidsceneYamlFileContext & {
            duration: number;
          } = {
            file: context.file,
            player,
            duration,
          };

          if (!isTTY) {
            console.log(
              contextTaskListSummary(player.taskStatusList, executedContext),
            );
          }

          return executedContext;
        } catch (error) {
          executionFailed = true;
          throw error;
        } finally {
          if (ownedPage && !this.config.keepWindow) {
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
        const executedContext = await executeFile(setupContext);
        executedResults.push(executedContext);
        setupFailed = !isYamlPlayerSuccessful(executedContext.player);
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
    } finally {
      if (ttyRenderer) {
        ttyRenderer.stop();
      }
    }

    return { executedResults, notExecutedContexts };
  }

  /**
   * Create an isolated page for one YAML execution while retaining the shared
   * browser context. Page-scoped state is intentionally not carried between
   * YAML files. The page is created inside the concurrency limiter via
   * executeFile, so the number of live task pages cannot exceed `concurrent`.
   */
  private async createPageForContext(
    context: BatchFileContext,
  ): Promise<Page | undefined> {
    const webTarget = resolveWebTarget(context.executionConfig)?.target;
    if (!context.options.browser || !webTarget || webTarget.bridgeMode) {
      return undefined;
    }

    return context.options.browser.newPage();
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

          try {
            const executedContext = await executeFile(context);
            executedResults.push(executedContext);

            if (!isYamlPlayerSuccessful(executedContext.player)) {
              stopLock.value = true;
              shouldStop = true;
            }
          } catch (error) {
            // Unexpected execution errors still abort the batch, but setting
            // the lock here prevents already-queued YAML files from starting
            // while Promise.allSettled drains the limiter.
            stopLock.value = true;
            shouldStop = true;
            throw error;
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
