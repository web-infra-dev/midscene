import { assert } from 'node:console';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import type {
  MidsceneYamlIndexResult,
  MidsceneYamlScript,
} from '@midscene/core';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { parseYamlScript } from '@midscene/web/yaml';
import pLimit from 'p-limit';
import puppeteer from 'puppeteer';
import { IndexYamlParser, type ParsedIndexConfig } from './index-parser';
import { type YamlExecutionResult, playYamlFiles } from './yaml-runner';

export interface BatchExecutionOptions {
  keepWindow?: boolean;
  headed?: boolean;
}

export class BatchYamlExecutor {
  private parser: IndexYamlParser;
  private config!: ParsedIndexConfig; // Use definite assignment assertion
  private results: MidsceneYamlIndexResult[] = [];
  private batchOutputDir: string;

  constructor(indexYamlPath: string) {
    this.parser = new IndexYamlParser(indexYamlPath);
    // Create batch output directory using entry filename + PID, similar to ScriptPlayer
    const indexFileName = basename(indexYamlPath, extname(indexYamlPath));
    this.batchOutputDir = join(
      getMidsceneRunSubDir('output'),
      `${indexFileName}-${Date.now()}`,
    );
  }

  async initialize(): Promise<void> {
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

    let browser: any = null;
    const taskResults: Array<{
      file: string;
      success: boolean;
      output?: string;
      report?: string;
      error?: string;
      startTime?: number;
      duration?: number;
    }> = [];
    try {
      browser = await puppeteer.launch({ headless: !headed });
      // Execute files with concurrency control using p-limit
      this.results = [];
      const limit = pLimit(concurrent);

      // Create tasks for all files
      const tasks = this.config.files.map((file) =>
        limit(async () => {
          const startTime = Date.now();
          try {
            // Load file configuration and build execution config with output path
            const fileConfig = await this.loadFileConfig(file);
            const outputPath = this.generateFileOutputPath(file);
            const executionConfig = this.parser.buildExecutionConfig(
              fileConfig,
              this.config,
              outputPath,
            );

            // Execute using existing playYamlFiles function with config override
            const result: YamlExecutionResult = await playYamlFiles(
              [{ file, script: executionConfig }],
              {
                keepWindow,
                headed,
                browser,
              },
            );
            const success = result.success;

            // Extract report and output file information
            let reportFile: string | undefined;
            let actualOutputPath: string | undefined;

            if (result.files.length > 0) {
              const fileResult = result.files[0];
              const player = fileResult.player;

              // 1. record reportFile
              if (player.reportFile) {
                reportFile = player.reportFile;
              }

              // 2. check output file
              let needWriteOutput = true;
              if (player.output && player.output === outputPath) {
                try {
                  const stats = statSync(outputPath);
                  if (stats.isFile()) {
                    actualOutputPath = this.formatOutputPath(outputPath);
                    needWriteOutput = false;
                  }
                } catch (e) {
                  // file not exist, continue
                }
              }

              // 3. if output file not generated, write result to output file
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

            return {
              file,
              success,
              output: actualOutputPath,
              report: reportFile,
              error: undefined,
              startTime,
              duration: Date.now() - startTime,
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            return {
              file,
              success: false,
              output: undefined,
              report: undefined,
              error: errorMessage,
              startTime,
              duration: Date.now() - startTime,
            };
          }
        }),
      );

      if (this.config.continueOnError) {
        const results = await Promise.allSettled(tasks);
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled') {
            taskResults.push(result.value);
          } else {
            taskResults.push({
              file: this.config.files[i],
              success: false,
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
              duration: 0,
            });
          }
        }
      } else {
        for (let i = 0; i < tasks.length; i++) {
          try {
            const value = await tasks[i];
            taskResults.push(value);
            if (!value.success) {
              break;
            }
          } catch (error) {
            taskResults.push({
              file: this.config.files[i],
              success: false,
              error: error instanceof Error ? error.message : String(error),
              duration: 0,
            });
            break;
          }
        }
      }
    } finally {
      if (browser) await browser.close();
    }

    this.results = taskResults;

    // Generate output index file
    await this.generateOutputIndex();

    return this.results;
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

    // Use the index parser to generate a simple filename without timestamp
    const outputPath = this.parser.generateOutputPath(
      file,
      this.batchOutputDir,
    );

    return outputPath;
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
    console.log('📄 Files to execute:');

    this.config.files.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file}`);
    });
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
}
