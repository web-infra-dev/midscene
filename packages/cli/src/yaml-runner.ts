import { assert } from 'node:console';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { agentFromAdbDevice } from '@midscene/android';
import type {
  FreeFn,
  MidsceneYamlIndexResult,
  MidsceneYamlScript,
} from '@midscene/core';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { AgentOverChromeBridge } from '@midscene/web/bridge-mode';
import { puppeteerAgentForTarget } from '@midscene/web/puppeteer-agent-launcher';
import { ScriptPlayer, parseYamlScript } from '@midscene/web/yaml';
import { createServer } from 'http-server';
import pLimit from 'p-limit';
import puppeteer from 'puppeteer';
import { IndexYamlParser, type ParsedIndexConfig } from './index-parser';
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

export type ExecutionMode = 'index' | 'files';

export const launchServer = async (
  dir: string,
): Promise<ReturnType<typeof createServer>> => {
  // https://github.com/http-party/http-server/blob/master/bin/http-server
  return new Promise((resolve) => {
    const server = createServer({
      root: dir,
    });
    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
};

export class YamlRunner {
  private parser!: IndexYamlParser;
  private config!: ParsedIndexConfig;
  private results: MidsceneYamlIndexResult[] = [];
  private batchOutputDir?: string;
  private mode: ExecutionMode;

  constructor(indexYamlPath: string, mode: 'index');
  constructor(files: string[], mode: 'files');
  constructor(pathOrFiles: string | string[], mode: ExecutionMode) {
    this.mode = mode;

    if (mode === 'files' && Array.isArray(pathOrFiles)) {
      // Handle simple file list - no batchOutputDir needed
      this.config = {
        files: pathOrFiles,
        concurrent: 1,
        continueOnError: false,
        patterns: [],
        android: undefined,
        web: undefined,
      };
    } else if (mode === 'index' && typeof pathOrFiles === 'string') {
      // Handle index YAML file
      this.parser = new IndexYamlParser(pathOrFiles);
      const indexFileName = basename(pathOrFiles, extname(pathOrFiles));
      this.batchOutputDir = join(
        getMidsceneRunSubDir('output'),
        `${indexFileName}-${Date.now()}`,
      );
    } else {
      throw new Error(
        `Invalid constructor arguments: mode '${mode}' doesn't match pathOrFiles type`,
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.mode === 'files') {
      // For simple file lists, config is already set in constructor
      return;
    }

    this.config = await this.parser.parse();

    // Update batch output directory if web.output is specified in index.yaml
    if (
      this.config.web?.output ||
      this.config.android?.output ||
      this.config.target?.output
    ) {
      // Use the directory containing the specified output file as the base directory
      this.batchOutputDir = dirname(
        this.config.web?.output || this.config.android?.output || '',
      );
    }
  }

  async run(
    options: BatchExecutionOptions = {},
  ): Promise<MidsceneYamlIndexResult[]> {
    assert(
      this.config,
      'BatchYamlExecutor not initialized. Call initialize() first.',
    );

    const { keepWindow = false, headed = false } = options;
    const concurrent = this.config.concurrent || 1;

    // Print execution plan
    this.printExecutionPlan(concurrent, keepWindow, headed);

    // Prepare file contexts like yaml-runner.ts
    const fileContextList: MidsceneYamlFileContext[] = [];
    let browser: any = null;

    try {
      browser = await puppeteer.launch({ headless: !headed });

      // Create all file contexts upfront
      for (const file of this.config.files) {
        const fileConfig = await this.loadFileConfig(file);

        let executionConfig: MidsceneYamlScript;
        let outputPath: string | undefined;

        if (this.mode === 'files') {
          // For simple file lists, use the file config directly and let ScriptPlayer decide output path
          executionConfig = fileConfig;
          outputPath = undefined; // Let ScriptPlayer handle output path
        } else {
          // For index YAML files, build execution config with parser
          outputPath = this.generateFileOutputPath(file);
          executionConfig = this.parser.buildExecutionConfig(
            fileConfig,
            this.config,
            outputPath,
          );
        }

        const fileName = basename(file, extname(file));
        const preference = {
          headed: options?.headed,
          keepWindow: options?.keepWindow,
          testId: fileName,
          cacheId: fileName,
        };

        const player = new ScriptPlayer(
          executionConfig,
          async () => {
            const freeFn: FreeFn[] = [];
            const webTarget = executionConfig.web || executionConfig.target;

            // Handle web config (copied from yaml-runner.ts)
            if (typeof webTarget !== 'undefined') {
              if (typeof executionConfig.target !== 'undefined') {
                console.warn(
                  'target is deprecated, please use web instead. See https://midscenejs.com/automate-with-scripts-in-yaml for more information. Sorry for the inconvenience.',
                );
              }

              // Launch local server if needed
              let localServer:
                | Awaited<ReturnType<typeof launchServer>>
                | undefined;
              if (webTarget.serve) {
                assert(
                  typeof webTarget.url === 'string',
                  'url is required in serve mode',
                );
                localServer = await launchServer(webTarget.serve);
                const serverAddress = localServer.server.address();
                freeFn.push({
                  name: 'local_server',
                  fn: () => localServer?.server.close(),
                });

                webTarget.url = `http://${serverAddress?.address}:${serverAddress?.port}${webTarget.url.startsWith('/') ? '' : '/'}${webTarget.url}`;
              }

              if (!webTarget.bridgeMode) {
                // Use puppeteer
                const { agent, freeFn: newFreeFn } =
                  await puppeteerAgentForTarget(webTarget, preference, browser);
                freeFn.push(...newFreeFn);

                return { agent, freeFn };
              }

              assert(
                webTarget.bridgeMode === 'newTabWithUrl' ||
                  webTarget.bridgeMode === 'currentTab',
                `bridgeMode config value must be either "newTabWithUrl" or "currentTab", but got ${webTarget.bridgeMode}`,
              );

              if (
                webTarget.userAgent ||
                webTarget.viewportWidth ||
                webTarget.viewportHeight ||
                webTarget.viewportScale ||
                webTarget.waitForNetworkIdle ||
                webTarget.cookie
              ) {
                console.warn(
                  'puppeteer options (userAgent, viewportWidth, viewportHeight, viewportScale, waitForNetworkIdle, cookie) are not supported in bridge mode. They will be ignored.',
                );
              }

              const agent = new AgentOverChromeBridge({
                closeNewTabsAfterDisconnect:
                  webTarget.closeNewTabsAfterDisconnect,
                cacheId: fileName,
              });

              if (webTarget.bridgeMode === 'newTabWithUrl') {
                await agent.connectNewTabWithUrl(webTarget.url);
              } else {
                if (webTarget.url) {
                  console.warn(
                    'url will be ignored in bridge mode with "currentTab"',
                  );
                }
                await agent.connectCurrentTab();
              }
              freeFn.push({
                name: 'destroy_agent_over_chrome_bridge',
                fn: () => agent.destroy(),
              });
              return {
                agent,
                freeFn,
              };
            }

            // Handle android
            if (typeof executionConfig.android !== 'undefined') {
              const androidTarget = executionConfig.android;
              const agent = await agentFromAdbDevice(androidTarget?.deviceId);

              if (androidTarget?.launch) {
                await agent.launch(androidTarget.launch);
              }

              freeFn.push({
                name: 'destroy_android_agent',
                fn: () => agent.destroy(),
              });

              return { agent, freeFn };
            }

            throw new Error(
              'No valid target configuration found in the yaml script, should be either "web" or "android"',
            );
          },
          undefined,
          this.mode === 'files' ? file : undefined,
        );

        // Set output path for the player only in index mode
        if (this.mode === 'index' && outputPath) {
          player.output = outputPath;
        }

        fileContextList.push({ file, player });
      }

      // Execute with the same logging system as yaml-runner.ts
      let ttyRenderer: TTYWindowRenderer | undefined;

      if (isTTY) {
        const summaryContents = () => {
          const summary: string[] = [''];
          for (const context of fileContextList) {
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

      // Track which contexts were actually executed
      let executedContexts = fileContextList;
      let notExecutedContexts: MidsceneYamlFileContext[] = [];

      // Handle index mode
      if (this.mode === 'index') {
        // Use pLimit for both continueOnError modes
        const limit = pLimit(concurrent);

        if (this.config.continueOnError === false) {
          // Execute with concurrency but stop new tasks when failure occurs
          executedContexts = [];
          let shouldStop = false;
          const stopLock = { value: false };

          const tasks = fileContextList.map((context, index) =>
            limit(async () => {
              // Check if we should stop before executing
              if (stopLock.value) {
                notExecutedContexts.push(context);
                return;
              }

              if (!isTTY) {
                const { mergedText } = contextInfo(context);
                console.log(mergedText);
              }

              await context.player.run();

              if (!isTTY) {
                console.log(
                  contextTaskListSummary(
                    context.player.taskStatusList,
                    context,
                  ),
                );
              }

              executedContexts.push(context);

              // Check if this task failed and signal to stop
              if (context.player.status === 'error' && !stopLock.value) {
                stopLock.value = true;
                shouldStop = true;
              }
            }),
          );

          await Promise.allSettled(tasks);

          // After all tasks are settled, properly categorize not executed contexts
          if (shouldStop) {
            // Remove any contexts that were marked as notExecuted but actually got executed
            notExecutedContexts = notExecutedContexts.filter(
              (ctx) => !executedContexts.includes(ctx),
            );
            // Add any contexts that weren't executed and aren't already in notExecutedContexts
            for (const context of fileContextList) {
              if (
                !executedContexts.includes(context) &&
                !notExecutedContexts.includes(context)
              ) {
                notExecutedContexts.push(context);
              }
            }
          }
        } else {
          // Execute all tasks with concurrency when continueOnError=true
          const tasks = fileContextList.map((context) =>
            limit(async () => {
              if (!isTTY) {
                const { mergedText } = contextInfo(context);
                console.log(mergedText);
              }
              await context.player.run();
              if (!isTTY) {
                console.log(
                  contextTaskListSummary(
                    context.player.taskStatusList,
                    context,
                  ),
                );
              }
            }),
          );

          await Promise.allSettled(tasks);
          // In this mode, all contexts are executed
          notExecutedContexts = [];
        }
      } else {
        // Files mode: execute sequentially (no concurrency for files mode)
        // Stop execution if any file fails (respecting continueOnError at task level)
        executedContexts = [];
        let shouldStop = false;

        for (const context of fileContextList) {
          if (shouldStop) {
            notExecutedContexts.push(context);
            continue;
          }

          if (!isTTY) {
            const { mergedText } = contextInfo(context);
            console.log(mergedText);
          }

          await context.player.run();

          if (!isTTY) {
            console.log(
              contextTaskListSummary(context.player.taskStatusList, context),
            );
          }

          // Always add the current context to executed list (even if it failed)
          executedContexts.push(context);

          // Check if this file failed and should stop further execution
          if (context.player.status === 'error') {
            shouldStop = true;
            // Add remaining contexts to notExecutedContexts
            const remainingIndex = fileContextList.indexOf(context) + 1;
            notExecutedContexts = fileContextList.slice(remainingIndex);
            break;
          }
        }
      }

      if (ttyRenderer) {
        ttyRenderer.stop();
      }

      // Print final summary for non-TTY mode
      if (!isTTY) {
        console.log('\n📋 Execution Results:');
        for (const context of executedContexts) {
          console.log(
            contextTaskListSummary(context.player.taskStatusList, context),
          );
        }
      }

      // Process results
      this.results = await this.processResults(
        executedContexts,
        notExecutedContexts,
      );
    } finally {
      if (browser) await browser.close();
    }

    // Generate output index file only in index mode
    if (this.mode === 'index') {
      await this.generateOutputIndex();
    }

    return this.results;
  }

  private async processResults(
    fileContextList: MidsceneYamlFileContext[],
    notExecutedContexts: MidsceneYamlFileContext[],
  ): Promise<MidsceneYamlIndexResult[]> {
    const results: MidsceneYamlIndexResult[] = [];

    for (const context of fileContextList) {
      const { file, player } = context;
      const success = player.status !== 'error';

      // Extract report and output file information
      let reportFile: string | undefined;
      let actualOutputPath: string | undefined;

      if (player.reportFile) {
        reportFile = player.reportFile;
      }

      // Check output file
      const outputPath = player.output;
      if (outputPath) {
        let needWriteOutput = true;
        try {
          const stats = statSync(outputPath);
          if (stats.isFile()) {
            if (this.mode === 'files') {
              // In files mode, use absolute path since files are not in batchOutputDir
              actualOutputPath = outputPath;
            } else {
              // In index mode, use relative path to batchOutputDir
              actualOutputPath = this.formatOutputPath(outputPath);
            }
            needWriteOutput = false;
          }
        } catch (e) {
          // file not exist, continue
        }

        // If output file not generated, write result to output file
        if (needWriteOutput) {
          try {
            const content =
              Object.keys(player.result).length > 0
                ? JSON.stringify(player.result, undefined, 2)
                : '{}';
            writeFileSync(outputPath, content);
            if (this.mode === 'files') {
              actualOutputPath = outputPath;
            } else {
              actualOutputPath = this.formatOutputPath(outputPath);
            }
          } catch (e) {
            console.warn(`Warning: Could not create output file: ${e}`);
          }
        }
      }

      results.push({
        file,
        success,
        output: actualOutputPath,
        report: reportFile,
        error:
          player.errorInSetup?.message ||
          (player.status === 'error' ? 'Execution failed' : undefined),
      });
    }

    // Add not executed contexts to results
    for (const context of notExecutedContexts) {
      results.push({
        file: context.file,
        success: false,
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
    // Build the result object with only allowed fields
    const result: MidsceneYamlScript = {
      tasks: fullConfig.tasks,
    };

    // Add allowed nested fields if they exist
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

  private generateFileOutputPath(file: string): string {
    // Ensure the batch output directory exists
    mkdirSync(this.batchOutputDir!, { recursive: true });

    // For index YAML files, use the index parser to generate output path
    const outputPath = this.parser.generateOutputPath(
      file,
      this.batchOutputDir!,
    );
    return outputPath;
  }

  private formatOutputPath(outputPath: string): string {
    const relativePath = relative(this.batchOutputDir!, outputPath);
    return `./${relativePath}`;
  }

  private printExecutionPlan(
    concurrent: number,
    keepWindow: boolean,
    headed: boolean,
  ): void {
    console.log('📋 Execution plan:');
    console.log(`   Files to execute: ${this.config.files.length}`);
    console.log(`   Concurrency: ${concurrent}`);
    if (this.mode === 'index' && this.batchOutputDir) {
      console.log(`   Output directory: ${this.batchOutputDir}`);
    }
    console.log(`   Keep window: ${keepWindow}`);
    console.log(`   Headed: ${headed}`);
  }

  private async generateOutputIndex(): Promise<void> {
    // Always generate index file in the batch output directory
    const indexPath = join(this.batchOutputDir!, 'index.json');

    try {
      // Ensure output directory exists
      mkdirSync(this.batchOutputDir!, { recursive: true });

      // Create index data with summary and references to individual files
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
          script: relative(this.batchOutputDir!, result.file),
          success: result.success,
          output: result.output, // Already stored with ./ prefix
          report: result.report
            ? relative(this.batchOutputDir!, result.report)
            : undefined,
          error: result.error,
          duration: result.duration,
        })),
      };

      // Write index file
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
    const notExecuted = this.results.filter(
      (r) => r.error === 'Not executed (previous task failed)',
    ).length;
    const failed = this.results.filter(
      (r) => !r.success && r.error !== 'Not executed (previous task failed)',
    ).length;

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
      .filter(
        (r) => !r.success && r.error !== 'Not executed (previous task failed)',
      )
      .map((r) => r.file);
  }

  getNotExecutedFiles(): string[] {
    return this.results
      .filter((r) => r.error === 'Not executed (previous task failed)')
      .map((r) => r.file);
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
