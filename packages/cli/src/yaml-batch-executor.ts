import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  MidsceneYamlConfigAttempt,
  MidsceneYamlConfigResult,
  MidsceneYamlScript,
  MidsceneYamlTargetConfig,
} from '@midscene/core';
import { parseYamlScript, resolveWebTarget } from '@midscene/core/yaml';
import { getDebug } from '@midscene/shared/logger';
import {
  buildChromeArgs,
  buildDownloadBehavior,
  defaultViewportHeight,
  defaultViewportWidth,
} from '@midscene/web/puppeteer-agent-launcher';

import merge from 'lodash.merge';
import pLimit from 'p-limit';
import puppeteer, {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from 'puppeteer';
import { createYamlPlayer } from './create-yaml-player';
import {
  createExecutedYamlResult,
  createNotExecutedYamlResult,
  createUnexpectedYamlResult,
  createYamlAttempt,
  getYamlAttemptsDuration,
  preserveYamlAttemptReport,
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
import { YamlBatchExecutionError } from './yaml-batch-error';

const batchWarning = getDebug('yaml-batch-executor', { console: true });

const normalizeExecutionError = (error: unknown): Error =>
  error instanceof Error
    ? error
    : new Error('Unexpected YAML execution failure', { cause: error });

export interface BatchRunnerConfig {
  files: string[];
  /**
   * A setup yaml file executed before the main `files`. A setup failure aborts
   * the batch and leaves the main files not executed. Puppeteer Web setup uses
   * `shareBrowserContext` to pass its successful browser state to the main
   * files. Other targets run setup in their own target environment without
   * browser-context sharing.
   */
  setup?: string;
  concurrent: number;
  continueOnError: boolean;
  /**
   * Number of extra attempts for a failed yaml file. The batch executor owns
   * retries so it can re-execute only failed files. Puppeteer Web setup retries
   * receive a clean browser context; other targets receive a new player/Agent
   * while their underlying device or external session may retain state.
   * Main-file retries preserve the successful setup environment. Defaults to 0
   * (no retry).
   */
  retry?: number;
  summary: string;
  /** Share one BrowserContext across Puppeteer Web yaml files. */
  shareBrowserContext: boolean;
  globalConfig?: MidsceneYamlTargetConfig;
  headed: boolean;
  keepWindow: boolean;
  dotenvOverride: boolean;
  dotenvDebug: boolean;
}

interface BatchFileContext {
  caseId: string;
  file: string;
  sourceConfig: MidsceneYamlScript;
  executionConfig: MidsceneYamlScript;
  outputPath?: string;
  options: {
    headed?: boolean;
    keepWindow?: boolean;
    browser?: Browser;
    browserContext?: BrowserContext;
  };
}

type BatchRuntimeTarget =
  | 'puppeteer-web'
  | 'bridge-web'
  | 'android'
  | 'ios'
  | 'harmony'
  | 'computer'
  | 'interface';

const batchRuntimeTargetLabel: Record<BatchRuntimeTarget, string> = {
  'puppeteer-web': 'Puppeteer Web',
  'bridge-web': 'Web bridge mode',
  android: 'Android',
  ios: 'iOS',
  harmony: 'HarmonyOS',
  computer: 'Computer',
  interface: 'Interface',
};

/**
 * Resolve a target only when the script has one unambiguous target family.
 * Structural target errors remain owned by createYamlPlayer, which provides
 * the canonical validation messages for missing or conflicting targets.
 */
const resolveBatchRuntimeTarget = (
  config: MidsceneYamlScript,
): BatchRuntimeTarget | undefined => {
  const webTarget = resolveWebTarget(config);
  const targets: BatchRuntimeTarget[] = [];
  if (webTarget) {
    targets.push(webTarget.target.bridgeMode ? 'bridge-web' : 'puppeteer-web');
  }
  if (typeof config.android !== 'undefined') targets.push('android');
  if (typeof config.ios !== 'undefined') targets.push('ios');
  if (typeof config.harmony !== 'undefined') targets.push('harmony');
  if (typeof config.computer !== 'undefined') targets.push('computer');
  if (typeof config.interface !== 'undefined') targets.push('interface');

  return targets.length === 1 ? targets[0] : undefined;
};

const assertBrowserContextUsage = (
  setupContext: BatchFileContext | undefined,
  allContexts: BatchFileContext[],
  shareBrowserContext: boolean,
): void => {
  const resolvedTargets = allContexts.map((context) => ({
    context,
    target: resolveBatchRuntimeTarget(context.executionConfig),
  }));

  if (shareBrowserContext) {
    const unsupported = resolvedTargets.find(
      ({ target }) => target && target !== 'puppeteer-web',
    );
    if (unsupported?.target) {
      throw new Error(
        `shareBrowserContext only supports Puppeteer Web targets, but "${unsupported.context.file}" uses ${batchRuntimeTargetLabel[unsupported.target]}. Remove shareBrowserContext or use a Puppeteer Web target.`,
      );
    }

    const browserCreationOptions = [
      'cdpEndpoint',
      'chromeArgs',
      'acceptInsecureCerts',
      'downloadPath',
    ] as const;
    for (const { context, target } of resolvedTargets) {
      if (target !== 'puppeteer-web') continue;
      const fileWebConfig = resolveWebTarget(context.sourceConfig)?.target;
      const misplacedOptions = browserCreationOptions.filter(
        (option) => typeof fileWebConfig?.[option] !== 'undefined',
      );
      if (misplacedOptions.length > 0) {
        throw new Error(
          `shareBrowserContext creates one browser from the batch global config, so browser-level option(s) ${misplacedOptions.map((option) => `"${option}"`).join(', ')} in "${context.file}" would be ignored. Move them to the batch config's global Web target.`,
        );
      }
    }
  }

  if (
    setupContext &&
    !shareBrowserContext &&
    resolveBatchRuntimeTarget(setupContext.executionConfig) === 'puppeteer-web'
  ) {
    throw new Error(
      `Puppeteer Web setup "${setupContext.file}" requires shareBrowserContext: true so its browser state can be shared with the main files.`,
    );
  }
};

interface ExecutedBatchFileContext extends MidsceneYamlFileContext {
  caseId: string;
  duration: number;
  yamlResult: MidsceneYamlConfigResult;
}

interface NotExecutedBatchFileContext {
  caseId: string;
  file: string;
  player: null;
}

interface UnexpectedBatchFileContext {
  caseId: string;
  file: string;
  error: Error;
  yamlResult: MidsceneYamlConfigResult;
}

type FileExecutionOutcome =
  | { kind: 'executed'; context: ExecutedBatchFileContext }
  | { kind: 'unexpected'; context: UnexpectedBatchFileContext };

export interface YamlBatchOccurrenceResult {
  caseId: string;
  result: MidsceneYamlConfigResult;
}

interface SharedBrowserRuntime {
  browserContext: BrowserContext;
}

const createSharedBrowserRuntime = async (
  browser: Browser,
  browserContextOptions?: BrowserContextOptions,
): Promise<SharedBrowserRuntime> => {
  const browserContext = await browser.createBrowserContext(
    browserContextOptions,
  );
  return { browserContext };
};

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
  private caseIds: string[];
  private results: YamlBatchOccurrenceResult[] = [];

  constructor(config: BatchRunnerConfig, caseIds?: string[]) {
    this.config = config;
    const occurrenceCount = config.files.length + (config.setup ? 1 : 0);
    this.caseIds =
      caseIds ??
      Array.from(
        { length: occurrenceCount },
        (_, index) => `batch-occurrence-${index + 1}`,
      );
    if (this.caseIds.length !== occurrenceCount) {
      throw new Error(
        `Batch occurrence identity mismatch: expected ${occurrenceCount} case ID(s), received ${this.caseIds.length}`,
      );
    }
    if (new Set(this.caseIds).size !== this.caseIds.length) {
      throw new Error('Batch occurrence case IDs must be unique');
    }
  }

  async run(
    options: RunYamlBatchOptions = {},
  ): Promise<YamlBatchOccurrenceResult[]> {
    const generateSummary = options.generateSummary ?? true;
    const shouldPrintExecutionPlan = options.printExecutionPlan ?? true;
    const { keepWindow, headed } = this.config;
    const setup = this.config.setup;

    // Print execution plan
    if (shouldPrintExecutionPlan) {
      printExecutionPlan(this.config);
    }

    // Prepare file contexts
    let setupContext: BatchFileContext | undefined;
    const fileContextList: BatchFileContext[] = [];
    let browser: Browser | null = null;
    const sharedRuntime = { current: null as SharedBrowserRuntime | null };
    let caseIndex = 0;
    let executionError: unknown;

    try {
      // Create the setup context (prerequisite) before the main files so the
      // TTY plan lists it first and its successful state can be handed off.
      if (setup) {
        const fileConfig = await this.loadFileConfig(setup);
        setupContext = await this.createFileContext(
          setup,
          fileConfig,
          { headed, keepWindow },
          this.caseIds[caseIndex++],
        );
      }

      // First, create all file contexts without a browser instance
      for (const file of this.config.files) {
        const fileConfig = await this.loadFileConfig(file);
        const context = await this.createFileContext(
          file,
          fileConfig,
          { headed, keepWindow },
          this.caseIds[caseIndex++],
        );
        fileContextList.push(context);
      }

      // A yaml file cannot be both the setup prerequisite and a main case.
      // Reject the ambiguous configuration explicitly.
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

      assertBrowserContextUsage(
        setupContext,
        allContexts,
        this.config.shareBrowserContext,
      );

      // Now, check if any of the tasks require a web browser
      const needsBrowser = allContexts.some(
        (ctx) => typeof resolveWebTarget(ctx.executionConfig) !== 'undefined',
      );
      let resetSetupRuntime: (() => Promise<void>) | undefined;

      if (needsBrowser && this.config.shareBrowserContext) {
        const globalWebConfig = resolveWebTarget(
          this.config.globalConfig ?? {},
        )?.target;
        const downloadBehavior = buildDownloadBehavior(
          globalWebConfig?.downloadPath,
        );
        const browserContextOptions = downloadBehavior
          ? { downloadBehavior }
          : undefined;

        if (globalWebConfig?.cdpEndpoint) {
          // CDP mode: connect to an existing browser
          browser = await puppeteer.connect({
            browserWSEndpoint: globalWebConfig.cdpEndpoint,
            defaultViewport: null,
            downloadBehavior,
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
            downloadBehavior,
            args,
            acceptInsecureCerts: globalWebConfig?.acceptInsecureCerts,
          });
        }

        resetSetupRuntime = async () => {
          if (!browser) {
            throw new Error('Cannot create a shared runtime without a browser');
          }

          if (sharedRuntime.current) {
            const staleRuntime = sharedRuntime.current;
            sharedRuntime.current = null;
            await staleRuntime.browserContext.close();
          }

          sharedRuntime.current = await createSharedBrowserRuntime(
            browser,
            browserContextOptions,
          );
          for (const context of allContexts) {
            context.options.browser = browser;
            context.options.browserContext =
              sharedRuntime.current.browserContext;
          }
        };

        await resetSetupRuntime();
      }

      // A failed setup attempt replaces the shared runtime; main-file retries
      // keep using the successful setup runtime.
      const {
        executedResults,
        unexpectedResults,
        notExecutedContexts,
        unexpectedError,
      } = await this.executeFiles(setupContext, fileContextList, {
        onProgress: options.onProgress,
        resetSetupRuntime,
      });

      this.results = await this.processResults(
        executedResults,
        unexpectedResults,
        notExecutedContexts,
      );
      executionError = unexpectedError;
    } catch (error) {
      executionError = error;
    } finally {
      if (browser && !this.config.keepWindow) {
        try {
          if (sharedRuntime.current) {
            await sharedRuntime.current.browserContext.close();
            sharedRuntime.current = null;
          }
        } catch (error) {
          if (executionError) {
            batchWarning(
              'failed to close the shared browser context after execution had already failed; preserving the original error',
              error,
            );
          } else {
            executionError = error;
          }
        }

        try {
          // For CDP mode, disconnect instead of closing the externally managed browser.
          const isCdp = !!resolveWebTarget(this.config.globalConfig ?? {})
            ?.target.cdpEndpoint;
          if (isCdp) {
            browser.disconnect();
          } else {
            await browser.close();
          }
        } catch (error) {
          if (executionError) {
            batchWarning(
              'failed to clean up the shared browser after execution had already failed; preserving the original error',
              error,
            );
          } else {
            executionError = error;
          }
        }
      }
      if (generateSummary) {
        await this.generateOutputIndex();
      }
    }

    if (executionError) {
      throw new YamlBatchExecutionError(executionError, this.results);
    }

    return this.results;
  }

  private async createFileContext(
    file: string,
    fileConfig: MidsceneYamlScript,
    options: { headed?: boolean; keepWindow?: boolean; browser?: Browser },
    caseId: string,
  ): Promise<BatchFileContext> {
    const { globalConfig } = this.config;

    // Deep clone to avoid mutation
    const clonedFileConfig = JSON.parse(JSON.stringify(fileConfig));

    // Start with the file's config, then merge the global config from the index file,
    // which has already been merged with command-line options.
    const executionConfig = merge(clonedFileConfig, globalConfig);

    return {
      caseId,
      file,
      sourceConfig: fileConfig,
      executionConfig,
      options,
    };
  }

  private async executeFiles(
    setupContext: BatchFileContext | undefined,
    fileContextList: BatchFileContext[],
    options: {
      onProgress?: (message: string) => void;
      resetSetupRuntime?: () => Promise<void>;
    },
  ): Promise<{
    executedResults: ExecutedBatchFileContext[];
    unexpectedResults: UnexpectedBatchFileContext[];
    notExecutedContexts: NotExecutedBatchFileContext[];
    unexpectedError?: Error;
  }> {
    const { onProgress, resetSetupRuntime } = options;
    const executedResults: ExecutedBatchFileContext[] = [];
    const unexpectedResults: UnexpectedBatchFileContext[] = [];
    const notExecutedContexts: NotExecutedBatchFileContext[] = [];

    // Create the setup player first. Main-file players are deferred until the
    // setup succeeds so they never retain a page from a discarded setup attempt.
    const allFileContexts: MidsceneYamlFileContext[] = [];
    const fileContextsByCaseId = new Map<string, MidsceneYamlFileContext>();
    const createFilePlayerContext = async (
      context: BatchFileContext,
    ): Promise<MidsceneYamlFileContext> => {
      const fileContext = {
        file: context.file,
        player: await createYamlPlayer(
          context.file,
          context.executionConfig,
          context.options,
        ),
      };
      fileContextsByCaseId.set(context.caseId, fileContext);
      return fileContext;
    };
    const initialContexts = setupContext ? [setupContext] : fileContextList;
    for (const context of initialContexts) {
      allFileContexts.push(await createFilePlayerContext(context));
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

    let unexpectedError: Error | undefined;

    try {
      // Helper function to execute a single file
      const executeFile = async (
        context: BatchFileContext,
        beforeRetry?: () => Promise<void>,
      ): Promise<FileExecutionOutcome> => {
        const allFileContext = fileContextsByCaseId.get(context.caseId);
        let lastAttemptStartTime: number | undefined;

        try {
          if (!allFileContext) {
            throw new Error(`Player not found for file: ${context.file}`);
          }

          const totalAttempts = resolveYamlMaxAttempts(this.config.retry);
          const attempts: MidsceneYamlConfigAttempt[] = [];
          let executedContext: ExecutedBatchFileContext | undefined;

          for (let attempt = 1; attempt <= totalAttempts; attempt++) {
            if (attempt > 1) {
              if (context.executionConfig.agent?.reportFileName) {
                attempts[attempts.length - 1] = preserveYamlAttemptReport(
                  attempts[attempts.length - 1],
                );
              }
              await beforeRetry?.();
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
            lastAttemptStartTime = startTime;
            await allFileContext.player.run();
            const duration = Date.now() - startTime;
            const attemptResult = createExecutedYamlResult({
              file: context.file,
              player: allFileContext.player,
              duration,
            });
            attempts.push(createYamlAttempt(attemptResult, attempt));
            const totalDuration = getYamlAttemptsDuration(attempts);

            const yamlResult: MidsceneYamlConfigResult = {
              ...attemptResult,
              duration: totalDuration,
              attempts: [...attempts],
            };
            executedContext = {
              caseId: context.caseId,
              file: context.file,
              player: allFileContext.player,
              duration: totalDuration,
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
          return { kind: 'executed', context: executedContext };
        } catch (error) {
          const normalizedError = normalizeExecutionError(error);
          return {
            kind: 'unexpected',
            context: {
              caseId: context.caseId,
              file: context.file,
              error: normalizedError,
              yamlResult: createUnexpectedYamlResult({
                file: context.file,
                error: normalizedError,
                duration:
                  lastAttemptStartTime === undefined
                    ? 0
                    : Date.now() - lastAttemptStartTime,
                player: allFileContext?.player,
              }),
            },
          };
        }
      };

      // Run the setup file first, if any. A setup failure aborts the batch:
      // every main file is marked as not executed. This holds regardless of
      // `continueOnError`, since the main files rely on the prerequisite state
      // the setup file establishes.
      let setupFailed = false;
      if (setupContext) {
        const outcome = await executeFile(setupContext, resetSetupRuntime);
        if (outcome.kind === 'unexpected') {
          unexpectedResults.push(outcome.context);
          unexpectedError = outcome.context.error;
          setupFailed = true;
        } else {
          executedResults.push(outcome.context);
          setupFailed = !outcome.context.yamlResult.success;
        }
      }

      if (setupFailed) {
        for (const context of fileContextList) {
          notExecutedContexts.push({
            caseId: context.caseId,
            file: context.file,
            player: null,
          });
        }
      } else {
        if (setupContext) {
          for (const context of fileContextList) {
            allFileContexts.push(await createFilePlayerContext(context));
          }
        }
        // Execute based on concurrency and error handling settings
        unexpectedError = await this.executeConcurrently(
          fileContextList,
          executeFile,
          executedResults,
          unexpectedResults,
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

    return {
      executedResults,
      unexpectedResults,
      notExecutedContexts,
      unexpectedError,
    };
  }

  private async executeConcurrently(
    fileContextList: BatchFileContext[],
    executeFile: (context: BatchFileContext) => Promise<FileExecutionOutcome>,
    executedResults: ExecutedBatchFileContext[],
    unexpectedResults: UnexpectedBatchFileContext[],
    notExecutedContexts: NotExecutedBatchFileContext[],
  ): Promise<Error | undefined> {
    const limit = pLimit(this.config.concurrent);
    let unexpectedError: Error | undefined;
    const recordOutcome = (outcome: FileExecutionOutcome) => {
      if (outcome.kind === 'unexpected') {
        unexpectedResults.push(outcome.context);
        unexpectedError ??= outcome.context.error;
      } else {
        executedResults.push(outcome.context);
      }
    };

    if (this.config.continueOnError) {
      // Execute all tasks with concurrency
      const tasks = fileContextList.map((context) =>
        limit(async () => {
          recordOutcome(await executeFile(context));
        }),
      );
      await Promise.all(tasks);
    } else {
      // Execute with concurrency but stop new tasks when failure occurs
      let shouldStop = false;
      const stopLock = { value: false };

      const tasks = fileContextList.map((context) =>
        limit(async () => {
          if (stopLock.value) {
            notExecutedContexts.push({
              caseId: context.caseId,
              file: context.file,
              player: null,
            });
            return;
          }

          const outcome = await executeFile(context);
          recordOutcome(outcome);

          if (
            (outcome.kind === 'unexpected' ||
              !outcome.context.yamlResult.success) &&
            !stopLock.value
          ) {
            stopLock.value = true;
            shouldStop = true;
          }
        }),
      );

      await Promise.all(tasks);

      // Handle not executed contexts
      if (shouldStop) {
        for (const context of fileContextList) {
          if (
            !executedResults.some((r) => r.caseId === context.caseId) &&
            !unexpectedResults.some((r) => r.caseId === context.caseId) &&
            !notExecutedContexts.some((ctx) => ctx.caseId === context.caseId)
          ) {
            notExecutedContexts.push({
              caseId: context.caseId,
              file: context.file,
              player: null,
            });
          }
        }
      }
    }

    return unexpectedError;
  }

  private async processResults(
    executedContexts: ExecutedBatchFileContext[],
    unexpectedContexts: UnexpectedBatchFileContext[],
    notExecutedContexts: NotExecutedBatchFileContext[],
  ): Promise<YamlBatchOccurrenceResult[]> {
    const resultsByCaseId = new Map<string, MidsceneYamlConfigResult>();

    for (const context of executedContexts) {
      resultsByCaseId.set(context.caseId, context.yamlResult);
    }

    for (const context of unexpectedContexts) {
      resultsByCaseId.set(context.caseId, context.yamlResult);
    }

    for (const context of notExecutedContexts) {
      resultsByCaseId.set(
        context.caseId,
        createNotExecutedYamlResult(context.file),
      );
    }

    return this.caseIds.map((caseId) => {
      const result = resultsByCaseId.get(caseId);
      if (!result) {
        throw new Error(`Batch result missing for case ID: ${caseId}`);
      }
      return { caseId, result };
    });
  }

  private async loadFileConfig(file: string): Promise<MidsceneYamlScript> {
    const content = readFileSync(file, 'utf8');
    return parseYamlScript(content, file);
  }

  private async generateOutputIndex(): Promise<void> {
    try {
      writeExecutionSummaryFile(
        this.config.summary,
        this.results.map(({ result }) => result),
      );
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
  const results = await new YamlBatchExecutor(config).run(options);
  return results.map(({ result }) => result);
}

export async function runYamlBatchWithCaseIds(
  config: BatchRunnerConfig,
  caseIds: string[],
  options: RunYamlBatchOptions = {},
): Promise<YamlBatchOccurrenceResult[]> {
  return new YamlBatchExecutor(config, caseIds).run(options);
}
