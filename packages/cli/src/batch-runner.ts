import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type {
  MidsceneYamlIndexResult,
  MidsceneYamlScript,
  MidsceneYamlScriptAndroidEnv,
  MidsceneYamlScriptEnv,
  MidsceneYamlScriptWebEnv,
} from '@midscene/core';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { type ScriptPlayer, parseYamlScript } from '@midscene/web/yaml';
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

export interface BatchExecutionOptions {
  keepWindow?: boolean;
  headed?: boolean;
}

export interface BatchRunnerConfig {
  files: string[];
  concurrent: number;
  continueOnError: boolean;
  indexFileName?: string;
  globalConfig?: {
    web?: MidsceneYamlScriptWebEnv;
    android?: MidsceneYamlScriptAndroidEnv;
    target?: MidsceneYamlScriptWebEnv;
  };
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
  private results: MidsceneYamlIndexResult[] = [];

  constructor(config: BatchRunnerConfig) {
    this.config = config;
  }

  async run(
    options: BatchExecutionOptions = {},
  ): Promise<MidsceneYamlIndexResult[]> {
    const { keepWindow = false, headed = false } = options;

    // Print execution plan
    this.printExecutionPlan(keepWindow, headed);

    // Prepare file contexts
    const fileContextList: BatchFileContext[] = [];
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({ headless: !headed });

      // Create all file contexts upfront
      for (const file of this.config.files) {
        const fileConfig = await this.loadFileConfig(file);
        const context = await this.createFileContext(file, fileConfig, {
          headed,
          keepWindow,
          browser,
        });
        fileContextList.push(context);
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
      if (browser) await browser.close();
    }

    // Generate output index file if needed
    if (this.config.indexFileName) {
      await this.generateOutputIndex();
    }

    return this.results;
  }

  private async createFileContext(
    file: string,
    fileConfig: MidsceneYamlScript,
    options: { headed?: boolean; keepWindow?: boolean; browser?: Browser },
  ): Promise<BatchFileContext> {
    const executionConfig: MidsceneYamlScript = fileConfig;
    const outputPath: string | undefined = undefined;

    return {
      file,
      executionConfig,
      outputPath,
      options,
    };
  }

  private async executeFiles(fileContextList: BatchFileContext[]): Promise<{
    executedResults: MidsceneYamlFileContext[];
    notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv>;
    }>;
  }> {
    const executedResults: MidsceneYamlFileContext[] = [];
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
      ): Promise<MidsceneYamlFileContext> => {
        if (!isTTY) {
          const { mergedText } = contextInfo({
            file: context.file,
            player: null,
          });
          console.log(mergedText);
        }

        // Find the corresponding player in allFileContexts
        const allFileContext = allFileContexts.find(
          (c) => c.file === context.file,
        );
        if (!allFileContext) {
          throw new Error(`Player not found for file: ${context.file}`);
        }

        // Set output path if specified
        if (context.outputPath) {
          allFileContext.player.output = context.outputPath;
        }

        // Run the player
        await allFileContext.player.run();

        const executedContext: MidsceneYamlFileContext = {
          file: context.file,
          player: allFileContext.player,
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
    ) => Promise<MidsceneYamlFileContext>,
    executedResults: MidsceneYamlFileContext[],
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
    executedContexts: MidsceneYamlFileContext[],
    notExecutedContexts: Array<{
      file: string;
      player: ScriptPlayer<MidsceneYamlScriptEnv> | null;
    }>,
  ): Promise<MidsceneYamlIndexResult[]> {
    const results: MidsceneYamlIndexResult[] = [];

    for (const context of executedContexts) {
      const { file, player } = context;
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
        error: 'Not executed (previous task failed)',
      });
    }

    return results;
  }

  private async loadFileConfig(file: string): Promise<MidsceneYamlScript> {
    const content = readFileSync(file, 'utf8');
    const fullConfig = parseYamlScript(content, file);
    const result: MidsceneYamlScript = {
      tasks: fullConfig.tasks,
    };

    if (fullConfig.web?.url || fullConfig.target?.url) {
      result.web = {
        url: fullConfig.web?.url || fullConfig.target?.url || '',
        serve: fullConfig.web?.serve || fullConfig.target?.serve || '',
      };
    }

    if (fullConfig.android?.launch) {
      result.android = { launch: fullConfig.android.launch };
    }

    return result;
  }

  private printExecutionPlan(keepWindow: boolean, headed: boolean): void {
    console.log('📋 Execution plan:');
    console.log(`   Files to execute: ${this.config.files.length}`);
    console.log(`   Concurrency: ${this.config.concurrent}`);
    console.log(`   Keep window: ${keepWindow}`);
    console.log(`   Headed: ${headed}`);
    console.log(`   Continue on error: ${this.config.continueOnError}`);
  }

  private async generateOutputIndex(): Promise<void> {
    let indexPath: string;

    if (
      this.config.globalConfig?.web?.output ||
      this.config.globalConfig?.android?.output
    ) {
      // if global config has output path, use it
      const outputPath =
        this.config.globalConfig.web?.output ||
        this.config.globalConfig.android?.output;
      indexPath = resolve(process.cwd(), outputPath);
    } else {
      // if global config has no output path, use default format: filename-timestamp.json
      const fileName = this.config.indexFileName;
      const indexFileName = `${fileName}-${Date.now()}.json`;
      const outputDir = getMidsceneRunSubDir('output');
      indexPath = join(outputDir, indexFileName);
    }

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
      console.log(`📊 Index file generated: ${resolve(indexPath)}`);
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

  getResults(): MidsceneYamlIndexResult[] {
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

    if (summary.successful > 0) {
      console.log('\n✅ Successful files:');
      this.getSuccessfulFiles().forEach((file) => {
        console.log(`   - ${file}`);
      });
    }

    if (summary.failed > 0) {
      console.log('\n❌ Failed files:');
      this.getFailedFiles().forEach((file) => {
        console.log(`   - ${file}`);
      });
    }

    if (summary.notExecuted > 0) {
      console.log('\n⏸️ Not executed files:');
      this.getNotExecutedFiles().forEach((file) => {
        console.log(`   - ${file}`);
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
