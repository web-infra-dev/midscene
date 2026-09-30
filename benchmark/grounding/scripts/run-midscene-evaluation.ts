#!/usr/bin/env tsx
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  sanitizeResult,
  snapshotBenchmarkImages,
} from '../evaluation/midscene/benchmark.js';
import {
  buildMidsceneModelConfig,
  createMidsceneEvaluationAgent,
} from '../evaluation/midscene/bridge-agent.js';
import { applyMidsceneLangSmithEnv } from '../evaluation/midscene/langsmith.js';
import { normalizeMidsceneRunConfig } from '../evaluation/midscene/normalize-run-config.js';
import { defaultMidsceneRepoPath } from '../evaluation/midscene/paths.js';
import { buildMidsceneEvaluationPlan } from '../evaluation/midscene/planner.js';
import { runByProviderQueue } from '../evaluation/midscene/provider-queue.js';
import { writeMidsceneDiffAgainstMain } from '../evaluation/midscene/repo.js';
import { scoreLocateAnswer } from '../evaluation/midscene/score-locate-answer.js';
import {
  type MidsceneRuntimeSource,
  prepareMidsceneRuntimeSource,
} from '../evaluation/midscene/source.js';
import type {
  MidsceneErrorRaw,
  MidsceneEvaluationPlanItem,
  MidsceneEvaluationResultItem,
  MidsceneResultsFileData,
  MidsceneRunState,
} from '../evaluation/midscene/types.js';
import {
  buildLiveReportPage,
  buildSingleReportPage,
} from '../evaluation/report-page/build-with-rsbuild.js';
import { collectCodeVersion } from '../evaluation/runtime/collect-code-version.js';
import { loadCases, loadModels } from '../evaluation/runtime/load-data.js';
import {
  casesDir,
  groundingRoot,
  outputRootDir,
} from '../evaluation/runtime/paths.js';
import { ensureRunDir } from '../evaluation/runtime/task-store.js';

function createInitialState(input: {
  runId: string;
  config: ReturnType<typeof normalizeMidsceneRunConfig>;
  total: number;
}): MidsceneRunState {
  return {
    runId: input.runId,
    status: 'pending',
    meta: input.config.meta,
    selection: {
      modelIds: input.config.selection.modelIds,
      caseNames: input.config.selection.caseNames,
      imageTypes: input.config.selection.imageTypes,
      promptSource: input.config.selection.promptSource,
    },
    execution: input.config.execution,
    locate: input.config.locate,
    modelConfig: input.config.modelConfig,
    debug: input.config.debug,
    progress: {
      total: input.total,
      completed: 0,
      currentDescription: '',
    },
    outcomes: {
      success: 0,
      failed: 0,
      pending: input.total,
    },
    artifacts: {
      runConfigJson: 'run-config.json',
      stateJson: 'state.json',
      resultsJson: 'results.json',
      reportHtml: 'report.html',
    },
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
  await rename(temporary, filePath);
}

type MidsceneDumpTaskInfo = {
  rawResponse?: string;
  rawChoiceMessage?: unknown;
  formatResponse?: string;
  searchAreaRawResponse?: string;
  searchAreaRawChoiceMessage?: unknown;
  searchArea?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getTaskInfoFromDump(value: unknown): MidsceneDumpTaskInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const taskInfo = value.taskInfo;
  return isRecord(taskInfo) ? taskInfo : undefined;
}

function getTaskInfoFromTaskLog(
  value: unknown,
): MidsceneDumpTaskInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const log = value.log;
  if (!isRecord(log)) {
    return undefined;
  }

  return getTaskInfoFromDump(log.dump);
}

function findMidsceneDumpTaskInfo(
  value: unknown,
  visited = new WeakSet<object>(),
): MidsceneDumpTaskInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (visited.has(value)) {
    return undefined;
  }
  visited.add(value);

  const directTaskInfo = getTaskInfoFromDump(value.dump);
  if (directTaskInfo) {
    return directTaskInfo;
  }

  const taskInfoFromErrorTask = getTaskInfoFromTaskLog(value.errorTask);
  if (taskInfoFromErrorTask) {
    return taskInfoFromErrorTask;
  }

  if (
    isRecord(value.runner) &&
    typeof value.runner.latestErrorTask === 'function'
  ) {
    const latestErrorTask = value.runner.latestErrorTask();
    const taskInfoFromRunner = getTaskInfoFromTaskLog(latestErrorTask);
    if (taskInfoFromRunner) {
      return taskInfoFromRunner;
    }
  }

  const taskInfoFromCause = findMidsceneDumpTaskInfo(value.cause, visited);
  if (taskInfoFromCause) {
    return taskInfoFromCause;
  }

  return findMidsceneDumpTaskInfo(
    isRecord(value.errorTask) ? value.errorTask.error : undefined,
    visited,
  );
}

function buildMidsceneErrorRaw(error: unknown): MidsceneErrorRaw {
  const message = error instanceof Error ? error.message : String(error);

  if (!error || typeof error !== 'object') {
    return {
      error: message,
    };
  }

  const serviceError = error as {
    name?: string;
    dump?: {
      taskInfo?: {
        rawResponse?: string;
        rawChoiceMessage?: unknown;
        formatResponse?: string;
        searchAreaRawResponse?: string;
        searchAreaRawChoiceMessage?: unknown;
        searchArea?: unknown;
      };
    };
  };
  const taskInfo =
    serviceError.dump?.taskInfo ?? findMidsceneDumpTaskInfo(error);

  return {
    error: message,
    name: serviceError.name,
    rawResponse: taskInfo?.rawResponse ?? null,
    rawChoiceMessage: taskInfo?.rawChoiceMessage,
    formatResponse: taskInfo?.formatResponse ?? null,
    searchAreaRawResponse: taskInfo?.searchAreaRawResponse ?? null,
    searchAreaRawChoiceMessage: taskInfo?.searchAreaRawChoiceMessage,
    searchArea: taskInfo?.searchArea,
  };
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return 'N/A';
  }

  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

async function buildMidsceneVersionSnapshot(source: MidsceneRuntimeSource) {
  return collectCodeVersion(source.repoPath);
}
function buildMidsceneRepoSnapshot(source: MidsceneRuntimeSource) {
  return {
    repoPath: source.repoPath,
    action: source.action,
    commitHash: source.commitHash,
    dirtyFiles: source.dirtyFiles,
    diffAgainstMain: 'midscene-main.diff',
  };
}
function buildMidsceneSourceSnapshot(source: MidsceneRuntimeSource) {
  return {
    type: source.type,
    moduleEntryFile: source.moduleEntryFile,
    repoPath: source.repoPath,
  };
}

export async function runEvaluation(configPath: string): Promise<void> {
  const originalCwd = process.cwd();
  const args = { configPath };
  const rawConfig = JSON.parse(await readFile(args.configPath, 'utf-8'));
  const runConfig = normalizeMidsceneRunConfig(rawConfig);
  const langsmithProject = applyMidsceneLangSmithEnv({
    enabled: runConfig.debug.enableLangSmith,
    title: runConfig.meta.title,
  });

  const midsceneSource = await prepareMidsceneRuntimeSource({
    repoPath: defaultMidsceneRepoPath,
  });

  const [models, cases, groundingVersion, midsceneVersion] = await Promise.all([
    loadModels(),
    loadCases(),
    collectCodeVersion(groundingRoot),
    buildMidsceneVersionSnapshot(midsceneSource),
  ]);

  const runId = runConfig.execution.runId.trim();
  if (!runId) {
    throw new Error(
      'run-config.json 里的 execution.runId 不能为空。请先固定 run-id、创建运行目录，再启动评测。',
    );
  }
  runConfig.execution.runId = runId;
  const runDir = await ensureRunDir(runId);
  const runConfigPath = path.join(runDir, 'run-config.json');
  const statePath = path.join(runDir, 'state.json');
  const resultsPath = path.join(runDir, 'results.json');
  const reportPath = path.join(runDir, 'report.html');
  const liveReportPath = path.join(runDir, 'report-live.html');
  const midsceneDiffPath = path.join(runDir, 'midscene-main.diff');
  const createdAt = new Date().toISOString();

  const plan = buildMidsceneEvaluationPlan({
    runConfig,
    models,
    cases,
  });

  const sensitiveValues = [
    ...plan.selectedModels.map((model) => model.apiKey),
    process.env.GROUNDING_MODELHUB_API_KEY || '',
  ];
  const benchmarkImages = await snapshotBenchmarkImages(plan, runDir);
  const state = createInitialState({
    runId,
    config: runConfig,
    total: plan.items.length,
  });
  if (midsceneSource.type === 'repo') {
    state.artifacts.midsceneDiff = 'midscene-main.diff';
  }
  await writeJson(runConfigPath, runConfig);
  await writeJson(statePath, state);
  const midsceneDiff =
    midsceneSource.type === 'repo'
      ? await writeMidsceneDiffAgainstMain({
          repoPath: midsceneSource.repoPath,
          outputPath: midsceneDiffPath,
        })
      : null;
  process.chdir(runDir);

  const results = new Array<MidsceneEvaluationResultItem | undefined>(
    plan.items.length,
  );
  const workerAgents = new Map<
    string,
    Promise<Awaited<ReturnType<typeof createMidsceneEvaluationAgent>>>
  >();
  let stopRequested = false;
  let persistChain: Promise<void> = Promise.resolve();

  const snapshotResults = () =>
    results.filter((item): item is MidsceneEvaluationResultItem =>
      Boolean(item),
    );

  const buildResultsFileSnapshot = (): MidsceneResultsFileData => ({
    schemaVersion: 1,
    runId,
    createdAt,
    completedAt:
      state.status === 'completed' ||
      state.status === 'failed' ||
      state.status === 'stopped'
        ? new Date().toISOString()
        : null,
    status: state.status === 'pending' ? 'running' : state.status,
    error: state.error ?? null,
    meta: runConfig.meta,
    config: runConfig,
    progress: {
      ...state.progress,
    },
    outcomes: {
      success: state.outcomes?.success ?? 0,
      failed: state.outcomes?.failed ?? 0,
      pending: state.outcomes?.pending ?? 0,
    },
    generatedAt: new Date().toISOString(),
    versions: {
      grounding: groundingVersion,
      midscene: midsceneVersion,
    },
    midsceneRepo: {
      ...buildMidsceneRepoSnapshot(midsceneSource),
      diffAgainstMain: midsceneDiff
        ? path.basename(midsceneDiff.outputPath)
        : null,
    },
    midsceneSource: buildMidsceneSourceSnapshot(midsceneSource),
    models: plan.selectedModels.map((model) => ({
      id: model.id,
      alias: model.alias,
      shortName: model.shortName,
      logo: model.logo,
      family: model.family,
      providerId: model.providerId,
      modelConfig: buildMidsceneModelConfig(model, {
        reasoningEnabled: runConfig.modelConfig.reasoningEnabled,
      }),
    })),
    cases: plan.selectedCases.map((caseRecord) => ({
      caseName: caseRecord.caseName,
      platform: caseRecord.platform,
      taskClass: caseRecord.taskClass,
      sourceName: caseRecord.sourceName,
      sourceCategory: caseRecord.sourceCategory,
      note: caseRecord.note,
      tags: caseRecord.tags,
      prompt: caseRecord.prompt,
      fallbackPrompt: caseRecord.fallbackPrompt,
      images: caseRecord.images
        .filter((image) =>
          runConfig.selection.imageTypes.includes(image.imageType),
        )
        .map((image) => ({
          fileName: image.fileName,
          imageType: image.imageType,
          gtBox: image.gtBox,
          expectedOutcome:
            image.expectedOutcome === 'refusal' ? 'refusal' : 'point',
          imageRelativePath:
            benchmarkImages.get(
              JSON.stringify([caseRecord.caseName, image.fileName]),
            ) ??
            path
              .relative(
                runDir,
                path.join(casesDir, caseRecord.caseName, image.fileName),
              )
              .split(path.sep)
              .join('/'),
        })),
    })),
    items: snapshotResults(),
  });

  const queuePersist = (options: { writeReportHtml: boolean }) => {
    persistChain = persistChain.then(async () => {
      const resultsFile = sanitizeResult(
        buildResultsFileSnapshot(),
        sensitiveValues,
      );
      await Promise.all([
        writeJson(statePath, sanitizeResult(state, sensitiveValues)),
        writeJson(resultsPath, resultsFile),
      ]);
      if (options.writeReportHtml) {
        await buildLiveReportPage({
          reportFilePath: liveReportPath,
        });
      }
    });
    return persistChain;
  };

  const handleStopSignal = (signal: NodeJS.Signals) => {
    if (stopRequested) {
      return;
    }
    stopRequested = true;
    state.status = 'stopped';
    state.error = `运行被 ${signal} 中断`;
    state.progress.currentDescription = '正在停止并落盘已完成结果';
    void queuePersist({ writeReportHtml: false });
  };

  process.on('SIGINT', handleStopSignal);
  process.on('SIGTERM', handleStopSignal);

  const getAgentForWorker = async (
    item: MidsceneEvaluationPlanItem,
    workerIndex: number,
  ): Promise<Awaited<ReturnType<typeof createMidsceneEvaluationAgent>>> => {
    const key = `${workerIndex}:${item.model.id}`;
    let agentPromise = workerAgents.get(key);
    if (!agentPromise) {
      agentPromise = createMidsceneEvaluationAgent({
        model: item.model,
        modelConfigOptions: {
          reasoningEnabled: runConfig.modelConfig.reasoningEnabled,
        },
        locateImplementation: item.locateImplementation,
        repoPath:
          midsceneSource.type === 'repo' ? midsceneSource.repoPath : undefined,
        moduleEntryFile: midsceneSource.moduleEntryFile,
      });
      workerAgents.set(key, agentPromise);
    }
    return agentPromise;
  };

  state.status = 'running';
  await queuePersist({ writeReportHtml: true });

  try {
    await runByProviderQueue(
      plan.items,
      async (
        item,
        itemIndex,
        workerIndex,
      ): Promise<MidsceneEvaluationResultItem> => {
        state.progress.currentDescription = `${item.model.alias} / ${item.caseName} / ${item.imageFileName} / 第 ${item.iteration} 次`;
        await queuePersist({ writeReportHtml: false });

        const startedAt = Date.now();

        try {
          const agent = await getAgentForWorker(item, workerIndex);
          await agent.setShot(item.screenshotPath);
          const locateResult = await agent.locate(item.prompt, {
            deepLocate: item.deepLocate,
            deepThink:
              item.locateImplementation === 'aiAct'
                ? runConfig.locate.aiActDeepThink
                : false,
          });
          const { hitGt, answerCorrect } = scoreLocateAnswer({
            expectedOutcome: item.expectedOutcome,
            gtBox: item.gtBox,
            locateResult,
          });

          const result: MidsceneEvaluationResultItem = {
            planItemId: item.id,
            modelId: item.model.id,
            modelAlias: item.model.alias,
            caseName: item.caseName,
            promptType: item.promptType,
            imageType: item.imageType,
            imageFileName: item.imageFileName,
            iteration: item.iteration,
            deepLocate: item.deepLocate,
            locateImplementation: item.locateImplementation,
            finished: true,
            hitGt,
            answerCorrect,
            expectedOutcome: item.expectedOutcome,
            durationMs: Date.now() - startedAt,
            locateResult,
          };

          results[itemIndex] = result;
          state.progress.completed += 1;
          if (state.outcomes) {
            state.outcomes.success += 1;
            state.outcomes.pending = Math.max(
              0,
              state.progress.total - state.progress.completed,
            );
          }
          await queuePersist({ writeReportHtml: false });
          return result;
        } catch (error) {
          const errorRaw = buildMidsceneErrorRaw(error);
          const result: MidsceneEvaluationResultItem = {
            planItemId: item.id,
            modelId: item.model.id,
            modelAlias: item.model.alias,
            caseName: item.caseName,
            promptType: item.promptType,
            imageType: item.imageType,
            imageFileName: item.imageFileName,
            iteration: item.iteration,
            deepLocate: item.deepLocate,
            locateImplementation: item.locateImplementation,
            finished: false,
            hitGt: false,
            answerCorrect: false,
            expectedOutcome: item.expectedOutcome,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
            locateResult: {
              raw: errorRaw,
              bbox: null,
              center: null,
            },
          };

          results[itemIndex] = result;
          state.progress.completed += 1;
          if (state.outcomes) {
            state.outcomes.failed += 1;
            state.outcomes.pending = Math.max(
              0,
              state.progress.total - state.progress.completed,
            );
          }
          await queuePersist({ writeReportHtml: false });
          return result;
        }
      },
      {
        providerConcurrency: runConfig.execution.providerConcurrency,
        shouldStop: () => stopRequested,
      },
    );

    if (!stopRequested) {
      state.status = 'completed';
    }
  } catch (error) {
    if (!stopRequested) {
      process.exitCode = 1;
      state.status = 'failed';
      state.error = error instanceof Error ? error.message : String(error);
    }
  }

  try {
    state.progress.currentDescription = '';
    await queuePersist({ writeReportHtml: false });

    const completedResults = snapshotResults();
    const finishedCount = completedResults.filter(
      (item) => item.finished,
    ).length;
    const failedCount = completedResults.length - finishedCount;
    const hitGtCount = completedResults.filter((item) => item.hitGt).length;
    const answerCorrectCount = completedResults.filter(
      (item) => item.answerCorrect ?? item.hitGt,
    ).length;
    const hitGtDenominator = state.progress.total;

    await buildSingleReportPage({
      resultsData: sanitizeResult(buildResultsFileSnapshot(), sensitiveValues),
      reportFilePath: reportPath,
    });
    console.log(`Midscene run ${state.status}.`);
    console.log(`Run ID: ${runId}`);
    console.log('Task Config:');
    console.log(`  Title: ${runConfig.meta.title || '(empty)'}`);
    console.log(`  Objective: ${runConfig.meta.objective || '(empty)'}`);
    console.log(
      `  Models: ${plan.selectedModels.map((model) => model.alias).join(', ')}`,
    );
    console.log(`  Cases: ${plan.selectedCases.length}`);
    console.log(`  Image Types: ${runConfig.selection.imageTypes.join(', ')}`);
    console.log(`  Prompt Source: ${runConfig.selection.promptSource}`);
    console.log(`  Iterations: ${runConfig.execution.iterations}`);
    console.log(
      `  Provider Concurrency: ${runConfig.execution.providerConcurrency}`,
    );
    console.log(`  Locate: ${runConfig.locate.implementation}`);
    console.log(`  Deep Locate: ${runConfig.locate.useDeepLocate}`);
    console.log(`  aiAct Deep Think: ${runConfig.locate.aiActDeepThink}`);
    console.log('Task Summary:');
    console.log(`  Total Items: ${state.progress.total}`);
    console.log(`  Completed Items: ${state.progress.completed}`);
    console.log(`  Finished: ${finishedCount}`);
    console.log(`  Failed: ${failedCount}`);
    console.log(
      `  Hit GT: ${hitGtCount}/${hitGtDenominator} (${formatPercent(
        hitGtCount,
        hitGtDenominator,
      )})`,
    );
    console.log(
      `  Answer Correct (all items): ${answerCorrectCount}/${state.progress.total} (${formatPercent(answerCorrectCount, state.progress.total)})`,
    );
    console.log(`Output Root: ${outputRootDir}`);
    console.log(`Run Config: ${runConfigPath}`);
    console.log(`State JSON: ${statePath}`);
    console.log(`Results JSON: ${resultsPath}`);
    console.log(`Report HTML: ${reportPath}`);
    if (midsceneSource.type === 'repo') {
      console.log(`Midscene Diff: ${midsceneDiffPath}`);
    }
    if (langsmithProject) {
      console.log(`LangSmith Project: ${langsmithProject}`);
    }
  } finally {
    process.off('SIGINT', handleStopSignal);
    process.off('SIGTERM', handleStopSignal);
    process.chdir(originalCwd);
  }
}
