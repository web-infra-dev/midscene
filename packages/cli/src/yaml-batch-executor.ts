import { readFileSync } from 'node:fs';
import type {
  MidsceneYamlConfigResult,
  MidsceneYamlScript,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptEnv,
  MidsceneYamlScriptIOSEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { type ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
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

export interface BatchRunnerConfig {
  files: string[];
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

    // Print execution plan
    if (shouldPrintExecutionPlan) {
      printExecutionPlan(this.config);
    }

    // Prepare file contexts
    const fileContextList: BatchFileContext[] = [];
    let browser: Browser | null = null;
    let sharedPage: Page | null = null;

    try {
      // First, create all file contexts without a browser instance
      for (const file of this.config.files) {
        const fileConfig = await this.loadFileConfig(file);
        const context = await this.createFileContext(file, fileConfig, {
          headed,
          keepWindow,
        });
        fileContextList.push(context);
      }

      // Now, check if any of the tasks require a web browser
      const needsBrowser = fileContextList.some(
        (ctx) =>
          Object.keys(
            ctx.executionConfig.web || ctx.executionConfig.target || {},
          ).length > 0,
      );

      if (needsBrowser && this.config.shareBrowserContext) {
        const globalWebConfig = this.config.globalConfig?.web;

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
        for (const context of fileContextList) {
          context.options.browser = browser;
          context.options.page = sharedPage;
        }
      }

      // Execute files
      const { executedResults, notExecutedContexts } =
        await this.executeFiles(fileContextList);

      // Process results
      this.results = await this.processResults(
        executedResults,
        notExecutedContexts,
      );
    } finally {
      if (browser && !this.config.keepWindow) {
        // For CDP mode, disconnect instead of closing the externally managed browser
        const isCdp = !!this.config.globalConfig?.web?.cdpEndpoint;
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

    // Normalize deprecated 'target' to 'web'
    if (clonedFileConfig.target) {
      clonedFileConfig.web = {
        ...clonedFileConfig.target,
        ...clonedFileConfig.web,
      };
      // biome-ignore lint/performance/noDelete: <explanation>
      delete clonedFileConfig.target;
    }
    if (globalConfig?.target) {
      globalConfig.web = { ...globalConfig.target, ...globalConfig.web };
      // biome-ignore lint/performance/noDelete: <explanation>
      delete globalConfig.target;
    }

    // Start with the file's config, then merge the global config from the index file,
    // which has already been merged with command-line options.
    const executionConfig = merge(clonedFileConfig, globalConfig);

    return {
      file,
      executionConfig,
      options,
    };
  }

  private async executeFiles(fileContextList: BatchFileContext[]): Promise<{
    executedResults: Array<MidsceneYamlFileContext & { duration: number }>;
    notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv>;
    }>;
  }> {
    const executedResults: Array<
      MidsceneYamlFileContext & { duration: number }
    > = [];
    const notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv>;
    }> = [];

    // Pre-create all player contexts for displaying task lists
    const allFileContexts: MidsceneYamlFileContext[] = [];
    for (const context of fileContextList) {
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

    try {
      // Helper function to execute a single file
      const executeFile = async (
        context: BatchFileContext,
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

        // Record start time
        const startTime = Date.now();

        // Run the player
        await allFileContext.player.run();

        // Calculate duration
        const endTime = Date.now();
        const duration = endTime - startTime;

        const executedContext: MidsceneYamlFileContext & { duration: number } =
          {
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
      };

      // Execute based on concurrency and error handling settings
      await this.executeConcurrently(
        fileContextList,
        executeFile,
        executedResults,
        notExecutedContexts,
      );

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

          if (executedContext.player.status === 'error' && !stopLock.value) {
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
