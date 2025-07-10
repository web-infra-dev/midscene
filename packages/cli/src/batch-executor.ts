import { assert } from 'node:console';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
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
  concurrent?: number;
  continueOnError?: boolean;
  dryRun?: boolean;
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
    const indexFileName = basename(indexYamlPath, '.yaml').replace(
      /\.(ya?ml)$/i,
      '',
    );
    this.batchOutputDir = join(
      getMidsceneRunSubDir('output'),
      `${indexFileName}-${process.pid}`,
    );
  }

  async initialize(): Promise<void> {
    this.config = await this.parser.parse();
  }

  async execute(
    options: BatchExecutionOptions = {},
  ): Promise<MidsceneYamlIndexResult[]> {
    assert(
      this.config,
      'BatchYamlExecutor not initialized. Call initialize() first.',
    );

    const {
      concurrent = this.config.concurrent,
      continueOnError = this.config.continueOnError,
      dryRun = false,
      keepWindow = false,
      headed = false,
    } = options;

    // Print execution plan
    this.printExecutionPlan(
      concurrent,
      continueOnError,
      dryRun,
      keepWindow,
      headed,
    );

    if (dryRun) {
      return this.createDryRunResults();
    }

    let browser: any = null;
    try {
      browser = await puppeteer.launch({ headless: !headed });
      // Execute files with concurrency control using p-limit
      this.results = [];
      const limit = pLimit(concurrent);

      // Create tasks for all files
      const tasks = this.config.files.map((file, index) =>
        limit(async () => {
          try {
            const startTime = Date.now();

            // Load and merge configuration
            const fileConfig = await this.loadFileConfig(file);
            const mergedConfig = this.parser.mergeGlobalConfig(
              fileConfig,
              this.config,
            );

            // Generate output path for this file
            const outputPath = this.generateFileOutputPath(file);
            if (mergedConfig.web) {
              mergedConfig.web.output = outputPath;
            } else if (mergedConfig.android) {
              mergedConfig.android.output = outputPath;
            } else if (mergedConfig.target) {
              mergedConfig.target.output = outputPath;
            }

            // Execute using existing playYamlFiles function with config override
            const result: YamlExecutionResult = await playYamlFiles(
              [{ file, script: mergedConfig }],
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

              // Report files stay in their original location (midscene_run/report)
              // Just reference the file path
              if (player.reportFile) {
                reportFile = player.reportFile;
              }

              // Check if the output file was created at the expected location
              if (player.output && player.output === outputPath) {
                try {
                  const stats = statSync(outputPath);
                  if (stats.isFile()) {
                    actualOutputPath = basename(outputPath); // Store only filename
                  }
                } catch (error) {
                  console.warn(
                    `Warning: Could not create or find output file: ${error}`,
                  );
                }
              }

              // If no output file was created, check if there are results and create one
              if (!actualOutputPath) {
                if (Object.keys(player.result).length > 0) {
                  // Create output file with player results
                  try {
                    writeFileSync(
                      outputPath,
                      JSON.stringify(player.result, undefined, 2),
                    );
                    actualOutputPath = basename(outputPath);
                  } catch (error) {
                    console.warn(
                      `Warning: Could not create output file: ${error}`,
                    );
                  }
                } else {
                  // Create empty result file to indicate successful execution with no data
                  try {
                    writeFileSync(outputPath, '{}');
                    actualOutputPath = basename(outputPath);
                  } catch (error) {
                    console.warn(
                      `Warning: Could not create empty output file: ${error}`,
                    );
                  }
                }
              }
            }

            return this.parser.createIndexResult(
              file,
              success,
              actualOutputPath,
              reportFile,
              undefined,
              startTime,
            );
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            return this.parser.createIndexResult(
              file,
              false,
              undefined,
              undefined,
              errorMessage,
            );
          }
        }),
      );

      // Execute all tasks with proper error handling
      if (continueOnError) {
        // If continue on error, execute all tasks and collect results
        const results = await Promise.allSettled(tasks);
        this.results = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            const file = this.config.files[index];
            const errorMessage =
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason);

            return this.parser.createIndexResult(
              file,
              false,
              undefined,
              undefined,
              errorMessage,
            );
          }
        });
      } else {
        // If not continue on error, stop on first failure
        try {
          this.results = await Promise.all(tasks);
        } catch (error) {
          // Find which file failed and include partial results
          const settledResults = await Promise.allSettled(tasks);
          this.results = [];

          for (let i = 0; i < settledResults.length; i++) {
            const result = settledResults[i];
            if (result.status === 'fulfilled') {
              this.results.push(result.value);
            } else {
              const file = this.config.files[i];
              const errorMessage =
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason);

              this.results.push(
                this.parser.createIndexResult(
                  file,
                  false,
                  undefined,
                  undefined,
                  errorMessage,
                ),
              );
              // Stop processing after first error
              break;
            }
          }
        }
      }
    } finally {
      if (browser) await browser.close();
    }

    // Generate output index file
    await this.generateOutputIndex();

    return this.results;
  }

  private async loadFileConfig(file: string): Promise<MidsceneYamlScript> {
    const content = readFileSync(file, 'utf8');
    return parseYamlScript(content, file);
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

  private printExecutionPlan(
    concurrent: number,
    continueOnError: boolean,
    dryRun: boolean,
    keepWindow: boolean,
    headed: boolean,
  ): void {
    console.log('📋 Execution Plan:');
    console.log(`   Files to execute: ${this.config.files.length}`);
    console.log(`   Concurrency: ${concurrent}`);
    console.log(`   Continue on error: ${continueOnError}`);
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
    console.log(`   Output directory: ${this.batchOutputDir}`);
    console.log(`   Keep window: ${keepWindow}`);
    console.log(`   Headed: ${headed}`);

    if (this.config.web) {
      console.log(
        `   Global web config: viewport ${this.config.web.viewportWidth}x${this.config.web.viewportHeight}`,
      );
    }

    if (this.config.android) {
      console.log(
        `   Global android config: device ${this.config.android.deviceId || 'default'}`,
      );
    }

    console.log('📄 Files to execute:');
    this.config.files.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file}`);
    });
  }

  private createDryRunResults(): MidsceneYamlIndexResult[] {
    return this.config.files.map((file) => ({
      file,
      success: true,
      output: this.generateFileOutputPath(file),
      duration: 0,
    }));
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
          generatedAt: new Date().toISOString(),
        },
        results: this.results.map((result) => ({
          file: result.file,
          success: result.success,
          output: result.output, // Already stored as filename only
          report: result.report, // Full path to report file
          error: result.error,
          duration: result.duration,
        })),
      };

      // Write index file
      writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
      console.log(`📊 Index file generated: ${indexPath}`);

      // Log individual output files that were preserved
      const preservedFiles = this.results.filter((r) => r.output && r.success);
      if (preservedFiles.length > 0) {
        console.log('📄 Individual output files preserved:');
        preservedFiles.forEach((result) => {
          console.log(`   ${result.file} → ${result.output}`);
        });
      }

      // Log report files that were preserved
      const preservedReports = this.results.filter(
        (r) => r.report && r.success,
      );
      if (preservedReports.length > 0) {
        console.log('📊 Individual report files preserved:');
        preservedReports.forEach((result) => {
          console.log(`   ${result.file} → ${result.report}`);
        });
      }
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
