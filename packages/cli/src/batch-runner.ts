import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type {
  MidsceneYamlConfigResult,
  MidsceneYamlScript,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { type ScriptPlayer, parseYamlScript } from '@midscene/core/yaml';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import merge from 'lodash.merge';
import pLimit from 'p-limit';
import puppeteer, { type Browser } from 'puppeteer';
import { createYamlPlayer } from './create-yaml-player';
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
  summary: string;
  shareBrowserContext: boolean;
  globalConfig?: {
    web?: MidsceneYamlScriptWebEnv;
    android?: MidsceneYamlScriptAndroidEnv;
    target?: MidsceneYamlScriptWebEnv;
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
  };
}

class BatchRunner {
  private config: BatchRunnerConfig;
  private results: MidsceneYamlConfigResult[] = [];

  constructor(config: BatchRunnerConfig) {
    this.config = config;
  }

  async run(): Promise<MidsceneYamlConfigResult[]> {
    const { keepWindow, headed } = this.config;

    // Print execution plan
    this.printExecutionPlan();

    // Prepare file contexts
    const fileContextList: BatchFileContext[] = [];
    let browser: Browser | null = null;

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
        browser = await puppeteer.launch({ headless: !headed });
        // Assign the browser instance to all contexts
        for (const context of fileContextList) {
          context.options.browser = browser;
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
      if (browser && !this.config.keepWindow) await browser.close();
      await this.generateOutputIndex();
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
      const success = player.status !== 'error';
      let reportFile: string | undefined;

      if (player.reportFile) {
        reportFile = player.reportFile;
      }

      // Check if output file actually exists
      let outputPath: string | undefined = player.output || undefined;
      if (outputPath && !existsSync(outputPath)) {
        outputPath = undefined;
      }

      results.push({
        file,
        success,
        executed: true,
        output: outputPath,
        report: reportFile,
        duration,
        error:
          player.errorInSetup?.message ||
          (player.status === 'error' ? 'Execution failed' : undefined),
      });
    }

    for (const context of notExecutedContexts) {
      results.push({
        file: context.file,
        success: false,
        executed: false,
        output: undefined,
        report: undefined,
        duration: 0,
        error: 'Not executed (previous task failed)',
      });
    }

    return results;
  }

  private async loadFileConfig(file: string): Promise<MidsceneYamlScript> {
    const content = readFileSync(file, 'utf8');
    return parseYamlScript(content, file, true);
  }

  private getSummaryAbsolutePath(): string {
    return resolve(getMidsceneRunSubDir('output'), this.config.summary);
  }

  private printExecutionPlan(): void {
    console.log('   Scripts:');
    for (const file of this.config.files) {
      console.log(`     - ${file}`);
    }
    console.log('📋 Execution plan');
    console.log(`   Concurrency: ${this.config.concurrent}`);
    console.log(`   Keep window: ${this.config.keepWindow}`);
    console.log(`   Headed: ${this.config.headed}`);
    console.log(`   Continue on error: ${this.config.continueOnError}`);
    console.log(
      `   Share browser context: ${this.config.shareBrowserContext ?? false}`,
    );
    console.log(`   Summary output: ${this.config.summary}`);
  }

  private async generateOutputIndex(): Promise<void> {
    // summary field should always have a value now
    const indexPath = resolve(
      getMidsceneRunSubDir('output'),
      this.config.summary,
    );
    const outputDir = dirname(indexPath);

    try {
      mkdirSync(outputDir, { recursive: true });

      const indexData = {
        summary: {
          total: this.results.length,
          successful: this.results.filter((r) => r.success).length,
          failed: this.results.filter((r) => !r.success).length,
          totalDuration: this.results.reduce(
            (sum, r) => sum + (r.duration || 0),
            0,
          ),
          generatedAt: new Date().toLocaleString(),
        },
        results: this.results.map((result) => ({
          script: relative(outputDir, result.file),
          success: result.success,
          output: result.output
            ? (() => {
                const relativePath = relative(outputDir, result.output);
                return relativePath.startsWith('.')
                  ? relativePath
                  : `./${relativePath}`;
              })()
            : undefined,
          report: result.report
            ? relative(outputDir, result.report)
            : undefined,
          error: result.error,
          duration: result.duration,
        })),
      };

      writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
      console.log('Execution finished:');
    } catch (error) {
      console.error('Failed to generate output index:', error);
    }
  }

  getExecutionSummary(): {
    total: number;
    successful: number;
    failed: number;
    notExecuted: number;
    totalDuration: number;
  } {
    const successful = this.results.filter((r) => r.success).length;
    const notExecuted = this.results.filter((r) => !r.executed).length;
    const failed = this.results.filter((r) => r.executed && !r.success).length;

    return {
      total: this.results.length,
      successful,
      failed,
      notExecuted,
      totalDuration: this.results.reduce(
        (sum, r) => sum + (r.duration || 0),
        0,
      ),
    };
  }

  getFailedFiles(): string[] {
    return this.results
      .filter((r) => r.executed && !r.success)
      .map((r) => r.file);
  }

  getNotExecutedFiles(): string[] {
    return this.results.filter((r) => !r.executed).map((r) => r.file);
  }

  getSuccessfulFiles(): string[] {
    return this.results.filter((r) => r.success).map((r) => r.file);
  }

  getResults(): MidsceneYamlConfigResult[] {
    return [...this.results];
  }

  printExecutionSummary(): boolean {
    const summary = this.getExecutionSummary();
    const success = summary.failed === 0 && summary.notExecuted === 0;

    console.log('\n📊 Execution Summary:');
    console.log(`   Total files: ${summary.total}`);
    console.log(`   Successful: ${summary.successful}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Not executed: ${summary.notExecuted}`);
    console.log(`   Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);
    console.log(`   Summary: ${this.getSummaryAbsolutePath()}`);

    if (summary.successful > 0) {
      console.log('\n✅ Successful files:');
      this.getSuccessfulFiles().forEach((file) => {
        console.log(`   ${file}`);
      });
    }

    if (summary.failed > 0) {
      console.log('\n❌ Failed files');
      this.getFailedFiles().forEach((file) => {
        console.log(`   ${file}`);
      });
    }

    if (summary.notExecuted > 0) {
      console.log('\n⏸️ Not executed files');
      this.getNotExecutedFiles().forEach((file) => {
        console.log(`   ${file}`);
      });
    }

    if (success) {
      console.log('\n🎉 All files executed successfully!');
    } else {
      console.log('\n⚠️ Some files failed or were not executed.');
    }

    return success;
  }
}

export { BatchRunner };
