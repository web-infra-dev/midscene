import { assert } from 'node:console';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
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

export class BatchYamlExecutor {
  private parser!: IndexYamlParser;
  private config!: ParsedIndexConfig;
  private results: MidsceneYamlIndexResult[] = [];
  private batchOutputDir: string;
  private mode: ExecutionMode;

  constructor(indexYamlPath: string, mode: 'index');
  constructor(files: string[], mode: 'files', options?: { outputDir?: string });
  constructor(
    pathOrFiles: string | string[],
    mode: ExecutionMode,
    options?: { outputDir?: string },
  ) {
    this.mode = mode;

    if (mode === 'files' && Array.isArray(pathOrFiles)) {
      // Handle simple file list
      this.batchOutputDir =
        options?.outputDir ||
        join(getMidsceneRunSubDir('output'), `batch-${Date.now()}`);
      // Create a minimal config for simple file list
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

  async execute(
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
        const outputPath = this.generateFileOutputPath(file);

        let executionConfig: MidsceneYamlScript;
        if (this.mode === 'files') {
          // For simple file lists, use the file config directly
          executionConfig = fileConfig;
        } else {
          // For index YAML files, build execution config with parser
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

        const player = new ScriptPlayer(executionConfig, async () => {
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
            let urlToVisit: string | undefined;
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
              if (webTarget.url.startsWith('/')) {
                urlToVisit = `http://${serverAddress?.address}:${serverAddress?.port}${webTarget.url}`;
              } else {
                urlToVisit = `http://${serverAddress?.address}:${serverAddress?.port}/${webTarget.url}`;
              }
              webTarget.url = urlToVisit;
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
        });

        // Set output path for the player
        player.output = outputPath;

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

      // Execute files with concurrency control
      const limit = pLimit(concurrent);
      const tasks = fileContextList.map((context) =>
        limit(async () => {
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
        }),
      );

      if (this.config.continueOnError) {
        await Promise.allSettled(tasks);
      } else {
        // Execute tasks sequentially and stop on first failure
        for (let i = 0; i < tasks.length; i++) {
          await tasks[i];
          // Check if current task failed
          if (fileContextList[i].player.status === 'error') {
            // Only process results for files that were executed
            fileContextList.splice(i + 1);
            break;
          }
        }
      }

      if (ttyRenderer) {
        ttyRenderer.stop();
      }

      // Process results
      this.results = await this.processResults(fileContextList);
    } finally {
      if (browser) await browser.close();
    }

    // Generate output index file
    await this.generateOutputIndex();

    return this.results;
  }

  private async processResults(
    fileContextList: MidsceneYamlFileContext[],
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
            actualOutputPath = this.formatOutputPath(outputPath);
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
            actualOutputPath = this.formatOutputPath(outputPath);
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
    mkdirSync(this.batchOutputDir, { recursive: true });

    if (this.mode === 'files') {
      // For simple file lists, generate a simple output path
      const fileName = basename(file, extname(file));
      return join(this.batchOutputDir, `${fileName}.json`);
    } else {
      // For index YAML files, use the index parser to generate output path
      const outputPath = this.parser.generateOutputPath(
        file,
        this.batchOutputDir,
      );
      return outputPath;
    }
  }

  private formatOutputPath(outputPath: string): string {
    const relativePath = relative(this.batchOutputDir, outputPath);
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
    console.log(`   Output directory: ${this.batchOutputDir}`);
    console.log(`   Keep window: ${keepWindow}`);
    console.log(`   Headed: ${headed}`);
  }

  private async generateOutputIndex(): Promise<void> {
    // Always generate index file in the batch output directory
    const indexPath = join(this.batchOutputDir, 'index.json');

    try {
      // Ensure output directory exists
      mkdirSync(this.batchOutputDir, { recursive: true });

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
          script: relative(this.batchOutputDir, result.file),
          success: result.success,
          output: result.output, // Already stored with ./ prefix
          report: result.report
            ? relative(this.batchOutputDir, result.report)
            : undefined,
          error: result.error,
          duration: result.duration,
        })),
      };

      // Write index file
      writeFileSync(indexPath, JSON.stringify(indexData, null, 2));

      console.log(`📊 Index file generated: ${indexPath}`);
    } catch (error) {
      console.error('Failed to generate output index:', error);
    }
  }

  getExecutionSummary(): {
    total: number;
    successful: number;
    failed: number;
    totalDuration: number;
  } {
    return {
      total: this.results.length,
      successful: this.results.filter((r) => r.success).length,
      failed: this.results.filter((r) => !r.success).length,
      totalDuration: this.results.reduce(
        (sum, r) => sum + (r.duration || 0),
        0,
      ),
    };
  }

  getFailedFiles(): string[] {
    return this.results.filter((r) => !r.success).map((r) => r.file);
  }

  getResults(): MidsceneYamlIndexResult[] {
    return [...this.results];
  }

  printExecutionSummary(): boolean {
    const summary = this.getExecutionSummary();
    const success = summary.failed === 0;

    console.log('\n📊 Execution Summary:');
    console.log(`   Total files: ${summary.total}`);
    console.log(`   Successful: ${summary.successful}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`);

    if (summary.failed > 0) {
      console.log('\n❌ Failed files:');
      this.getFailedFiles().forEach((file) => {
        console.log(`   - ${file}`);
      });
    } else {
      console.log('\n✅ All files executed successfully!');
    }

    return success;
  }
}
