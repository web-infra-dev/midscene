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
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { createYamlPlayer } from './create-yaml-player';
import {
  createExecutedYamlResult,
  createNotExecutedYamlResult,
  createYamlAttempt,
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
   * A setup yaml file executed before the main `files`. It reuses the shared
   * browser context, so any prerequisite state (e.g. a login) is visible to
   * every main file. A setup failure aborts the batch and leaves the main files
   * not executed. Only honored when `shareBrowserContext` is true; the config
   * layer rejects other combinations.
   */
  setup?: string;
  concurrent: number;
  continueOnError: boolean;
  /**
   * Number of extra attempts for a failed yaml file. The batch executor owns
   * retries so shared-browser runs can re-execute only failed files while
   * preserving the browser context. Defaults to 0 (no retry).
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
  options: {
    headed?: boolean;
    keepWindow?: boolean;
    browser?: Browser;
    page?: Page;
  };
}

interface ExecutedBatchFileContext extends MidsceneYamlFileContext {
  duration: number;
  yamlResult: MidsceneYamlConfigResult;
}

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

    // The setup file relies on the shared page to hand prerequisite state to
    // the main files. Enforce that invariant here too, so the executor stays
    // correct even if it is constructed directly, bypassing the config layer.
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
    let sharedPage: Page | null = null;

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

        // Create a shared page instance that will be reused across all YAML files
        // This ensures localStorage and sessionStorage are preserved between files
        sharedPage = await browser.newPage();

        // Assign the browser instance and shared page to all contexts
        for (const context of allContexts) {
          context.options.browser = browser;
          context.options.page = sharedPage;
        }
      }

      // Execute files
      const { executedResults, notExecutedContexts } = await this.executeFiles(
        setupContext,
        fileContextList,
        options.onProgress,
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
    onProgress?: (message: string) => void,
  ): Promise<{
    executedResults: ExecutedBatchFileContext[];
    notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv> | null;
    }>;
  }> {
    const executedResults: ExecutedBatchFileContext[] = [];
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

          const yamlResult: MidsceneYamlConfigResult = {
            ...attemptResult,
            attempts: [...attempts],
          };
          executedContext = {
            file: context.file,
            player: allFileContext.player,
            duration,
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
        const executedContext = await executeFile(setupContext);
        executedResults.push(executedContext);
        setupFailed = !executedContext.yamlResult.success;
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
