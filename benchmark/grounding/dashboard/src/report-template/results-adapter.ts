import type {
  MidsceneEvaluationResultItem,
  MidsceneResultsFileData,
} from '../../../evaluation/midscene/types.js';
import type {
  BBox,
  ErrorDetail,
  LocationRequestRecord,
  ModelLocationRecord,
} from '../../../evaluation/task-types.js';
import type { RunTaskFileData } from '../../../evaluation/types.js';
import type {
  ImageDetail,
  ReportData,
  ReportImageMetaLoader,
} from './report-types';

type CaseImageMeta = {
  gtBox: [number, number, number, number] | null;
  expectedOutcome?: 'point' | 'refusal';
  imageRelativePath: string;
  imageWidth: number | null;
  imageHeight: number | null;
  caseTags: string[];
};

function toReportRunConfig(
  resultsFile: MidsceneResultsFileData,
): RunTaskFileData['runConfig'] {
  return {
    meta: {
      ...resultsFile.meta,
    },
    selection: {
      ...resultsFile.config.selection,
    },
    execution: {
      ...resultsFile.config.execution,
    },
    locate: {
      ...resultsFile.config.locate,
    },
    debug: {
      ...resultsFile.config.debug,
    },
  };
}

function toBBoxRecord(
  bbox?: [number, number, number, number] | null,
): BBox | null {
  return bbox
    ? {
        xMin: bbox[0],
        yMin: bbox[1],
        xMax: bbox[2],
        yMax: bbox[3],
      }
    : null;
}

function toPointRecord(
  center?: [number, number] | null,
): { x: number; y: number } | null {
  return center
    ? {
        x: center[0],
        y: center[1],
      }
    : null;
}

function stringifyRaw(raw: unknown, fallback: string | null): string | null {
  if (raw == null) {
    return fallback;
  }
  if (typeof raw === 'string') {
    return raw;
  }
  return JSON.stringify(raw, null, 2);
}

function toErrorDetail(
  result: MidsceneEvaluationResultItem,
): ErrorDetail | undefined {
  if (result.finished || !result.error) {
    return undefined;
  }

  const raw = stringifyRaw(result.locateResult?.raw, null);
  return {
    message: result.error,
    raw: raw ?? undefined,
  };
}

function toRequestRecord(
  result: MidsceneEvaluationResultItem,
  expectedOutcome?: 'point' | 'refusal',
): LocationRequestRecord {
  const fallbackRawResponse = result.finished ? null : (result.error ?? null);
  const aiLocateRawResponse = stringifyRaw(
    result.locateResult?.raw,
    fallbackRawResponse,
  );
  const bbox = toBBoxRecord(result.locateResult?.bbox);
  const center = toPointRecord(result.locateResult?.center);
  const abstained = result.locateResult?.outcome === 'not-found';
  const success = result.finished && Boolean(bbox || center || abstained);
  const errorDetail = toErrorDetail(result);

  return {
    iterationIndex: result.iteration,
    locate: {
      success,
      rawResponse: aiLocateRawResponse,
      parsedBbox: bbox,
      parsedBboxCoordinateSpace: bbox ? 'pixel' : undefined,
      center,
      hitGt: result.hitGt,
      answerCorrect: result.answerCorrect,
      expectedOutcome: result.expectedOutcome ?? expectedOutcome,
      abstained,
      error: success ? undefined : result.finished ? undefined : result.error,
      errorDetail,
    },
    durationMs: result.durationMs,
    error: result.finished ? undefined : result.error,
    errorDetail,
  };
}

export function buildTaskFromResultsFile(
  resultsFile: MidsceneResultsFileData,
): RunTaskFileData {
  // Materialize the fixed plan, including models/images with no result yet.
  // Missing requests stay empty instead of becoming synthetic failures.
  const taskResults: ModelLocationRecord[] = resultsFile.models.map(
    (model) => ({
      modelId: model.id,
      modelAlias: model.alias,
      cases: resultsFile.cases.map((caseRecord) => ({
        caseName: caseRecord.caseName,
        promptType: resultsFile.config.selection.promptSource,
        images: caseRecord.images
          .filter((image) =>
            resultsFile.config.selection.imageTypes.includes(image.imageType),
          )
          .map((image) => ({
            imageName: image.fileName,
            imageType: image.imageType,
            requests: resultsFile.items
              .filter(
                (result) =>
                  result.modelId === model.id &&
                  result.caseName === caseRecord.caseName &&
                  result.imageType === image.imageType &&
                  result.imageFileName === image.fileName,
              )
              .sort((a, b) => a.iteration - b.iteration)
              .map((result) => toRequestRecord(result, image.expectedOutcome)),
          })),
      })),
    }),
  );

  return {
    id: resultsFile.runId,
    createdAt: resultsFile.createdAt,
    completedAt: resultsFile.completedAt ?? undefined,
    status: resultsFile.status,
    params: {
      useDeepLocate: resultsFile.config.locate.useDeepLocate,
      locateImplementation: resultsFile.config.locate.implementation,
      iterations: resultsFile.config.execution.iterations,
      selectedModels: resultsFile.models.map((item) => ({
        id: item.id,
        alias: item.alias,
      })),
      useHdImage: resultsFile.config.selection.imageTypes.includes('hd'),
      useSdImage: resultsFile.config.selection.imageTypes.includes('sd'),
    },
    runConfig: toReportRunConfig(resultsFile),
    codeVersion: resultsFile.versions.grounding,
    midsceneCodeVersion: resultsFile.versions.midscene,
    progress: {
      ...resultsFile.progress,
    },
    results: taskResults,
    error: resultsFile.error ?? undefined,
    generatedAt: resultsFile.generatedAt,
  };
}

function calculateAccuracy(
  correctCount: number,
  successCount: number,
): number | null {
  if (successCount <= 0) {
    return null;
  }

  return correctCount / successCount;
}

function calculateOverallSuccess(accuracy: number | null): boolean | null {
  if (accuracy == null) {
    return null;
  }

  return accuracy >= 0.9;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

async function defaultLoadImageMeta(
  imageRelativePath: string,
): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });
    };
    image.onerror = () => {
      resolve({ width: null, height: null });
    };
    image.src = imageRelativePath;
  });
}

function makeImageKey(
  caseName: string,
  imageName: string,
  imageType: 'sd' | 'hd',
): string {
  return `${caseName}|${imageName}|${imageType}`;
}

export async function buildReportDataFromResultsFile(input: {
  resultsFile: MidsceneResultsFileData;
  loadImageMeta?: ReportImageMetaLoader;
}): Promise<ReportData> {
  const { resultsFile, loadImageMeta = defaultLoadImageMeta } = input;
  const task = buildTaskFromResultsFile(resultsFile);
  const scoringMode = 'answer' as const;
  const caseMap = new Map(
    resultsFile.cases.map((item) => [item.caseName, item]),
  );
  const modelMap = new Map(resultsFile.models.map((item) => [item.id, item]));
  const imageMetaMap = new Map<string, CaseImageMeta>();

  await Promise.all(
    resultsFile.cases.flatMap((caseItem) =>
      caseItem.images.map(async (image) => {
        const key = makeImageKey(
          caseItem.caseName,
          image.fileName,
          image.imageType,
        );
        const meta = await loadImageMeta(image.imageRelativePath);
        imageMetaMap.set(key, {
          gtBox: image.gtBox,
          expectedOutcome: image.expectedOutcome,
          imageRelativePath: image.imageRelativePath,
          imageWidth: meta.width,
          imageHeight: meta.height,
          caseTags: caseItem.tags,
        });
      }),
    ),
  );

  const imageDetails: ImageDetail[] = [];
  const totals = {
    caseCount: 0,
    imageCount: 0,
    requestCount: 0,
    plannedRequestCount: 0,
    pendingRequestCount: 0,
    successCount: 0,
    requestSuccessCount: 0,
    averageDurationMs: 0,
  };
  const modelSummaries: ReportData['modelSummaries'] = (task.results ?? []).map(
    (model) => ({
      modelId: model.modelId,
      modelAlias: model.modelAlias,
      shortName: modelMap.get(model.modelId)?.shortName ?? '',
      logo: modelMap.get(model.modelId)?.logo ?? '',
      logoDataUri: modelMap.get(model.modelId)?.logoDataUri,
      family: modelMap.get(model.modelId)?.family ?? null,
      imageCount: 0,
      totalRequests: 0,
      pendingRequests: 0,
      successCount: 0,
      hitCount: 0,
      scoreDenominator: 0,
      passedImages: 0,
      participatedImages: 0,
      averageDurationMs: 0,
      p50DurationMs: 0,
      p90DurationMs: 0,
      p95DurationMs: 0,
      maxDurationMs: 0,
      requestSuccessCount: 0,
      hitRate: null,
      requestSuccessRate: null,
    }),
  );
  const modelSummaryMap = new Map(
    modelSummaries.map((item) => [item.modelId, item]),
  );
  const modelDurationMap = new Map<string, number[]>();
  const caseSet = new Set<string>();
  let durationSum = 0;

  for (const model of task.results ?? []) {
    const modelSummary = modelSummaryMap.get(model.modelId);
    const modelRecord = modelMap.get(model.modelId);
    if (!modelSummary) {
      continue;
    }

    for (const caseResult of model.cases) {
      caseSet.add(caseResult.caseName);
      const caseRecord = caseMap.get(caseResult.caseName);

      for (const imageResult of caseResult.images) {
        const meta =
          imageMetaMap.get(
            makeImageKey(
              caseResult.caseName,
              imageResult.imageName,
              imageResult.imageType,
            ),
          ) ?? null;
        const requestCount = imageResult.requests.length;
        const plannedRequestCount = resultsFile.config.execution.iterations;
        if (requestCount > plannedRequestCount) {
          throw new Error(
            `More results than planned for ${model.modelId}/${caseResult.caseName}/${imageResult.imageName}`,
          );
        }
        const pendingRequestCount = plannedRequestCount - requestCount;
        const successCount = imageResult.requests.filter(
          (request) => request.locate.success,
        ).length;
        const requestSuccessCount = imageResult.requests.filter(
          (request) => !request.error,
        ).length;
        const successfulRequestDurations = imageResult.requests
          .filter((request) => !request.error)
          .map((request) => request.durationMs);
        const averageDurationMs =
          successfulRequestDurations.length > 0
            ? successfulRequestDurations.reduce(
                (sum, duration) => sum + duration,
                0,
              ) / successfulRequestDurations.length
            : 0;
        const correctCount = imageResult.requests.filter((request) =>
          scoringMode === 'answer'
            ? !request.error &&
              request.locate.success &&
              (request.locate.answerCorrect === true ||
                (request.locate.answerCorrect == null &&
                  request.locate.expectedOutcome !== 'refusal' &&
                  request.locate.hitGt))
            : request.locate.hitGt,
        ).length;
        const accuracy = calculateAccuracy(
          correctCount,
          scoringMode === 'answer' ? plannedRequestCount : successCount,
        );
        const overallSuccess =
          pendingRequestCount > 0 ? null : calculateOverallSuccess(accuracy);

        totals.imageCount += 1;
        totals.requestCount += requestCount;
        totals.plannedRequestCount += plannedRequestCount;
        totals.pendingRequestCount += pendingRequestCount;
        totals.successCount += successCount;
        totals.requestSuccessCount += requestSuccessCount;
        durationSum += successfulRequestDurations.reduce(
          (sum, duration) => sum + duration,
          0,
        );

        modelSummary.imageCount += 1;
        modelSummary.totalRequests += requestCount;
        modelSummary.pendingRequests += pendingRequestCount;
        modelSummary.successCount += successCount;
        modelSummary.hitCount += correctCount;
        modelSummary.scoreDenominator =
          (modelSummary.scoreDenominator ?? 0) +
          (scoringMode === 'answer' ? plannedRequestCount : successCount);
        modelSummary.requestSuccessCount += requestSuccessCount;
        modelSummary.averageDurationMs += successfulRequestDurations.reduce(
          (sum, duration) => sum + duration,
          0,
        );
        const modelDurations = modelDurationMap.get(model.modelId) ?? [];
        modelDurations.push(...successfulRequestDurations);
        modelDurationMap.set(model.modelId, modelDurations);
        if (accuracy != null) {
          modelSummary.participatedImages += 1;
          if (overallSuccess) {
            modelSummary.passedImages += 1;
          }
        }

        imageDetails.push({
          modelId: model.modelId,
          modelAlias: model.modelAlias,
          modelFamily: modelRecord?.family ?? null,
          caseName: caseResult.caseName,
          caseTags: caseRecord?.tags ?? [],
          promptType: caseResult.promptType,
          imageName: imageResult.imageName,
          imageType: imageResult.imageType,
          imageRelativePath: meta?.imageRelativePath ?? '',
          imageWidth: meta?.imageWidth ?? null,
          imageHeight: meta?.imageHeight ?? null,
          gtBox: meta?.gtBox ?? null,
          expectedOutcome: meta?.expectedOutcome,
          requestCount,
          plannedRequestCount,
          pendingRequestCount,
          successCount,
          correctCount,
          averageDurationMs,
          accuracy: requestCount > 0 ? accuracy : null,
          overallSuccess,
          requests: imageResult.requests.map((request) => ({
            iterationIndex: request.iterationIndex,
            durationMs: request.durationMs,
            locate: request.locate,
            locateDisplayBbox: request.locate.parsedBbox,
            error: request.error,
            errorDetail: request.errorDetail,
          })),
        });
      }
    }
  }

  totals.caseCount = caseSet.size;
  totals.averageDurationMs =
    totals.requestSuccessCount > 0
      ? durationSum / totals.requestSuccessCount
      : 0;

  for (const summary of modelSummaries) {
    const durations = modelDurationMap.get(summary.modelId) ?? [];
    summary.averageDurationMs =
      durations.length > 0 ? summary.averageDurationMs / durations.length : 0;
    summary.p50DurationMs = percentile(durations, 50);
    summary.p90DurationMs = percentile(durations, 90);
    summary.p95DurationMs = percentile(durations, 95);
    summary.maxDurationMs = durations.length > 0 ? Math.max(...durations) : 0;
    summary.hitRate =
      (summary.scoreDenominator ?? 0) > 0
        ? summary.hitCount / (summary.scoreDenominator ?? 0)
        : null;
    summary.requestSuccessRate =
      summary.totalRequests > 0
        ? summary.requestSuccessCount / summary.totalRequests
        : null;
  }

  return {
    title: resultsFile.meta.title || 'Grounding Evaluation Report',
    scoringMode,
    task,
    caseCatalog: resultsFile.cases.map((item) => ({
      caseName: item.caseName,
      tags: item.tags,
      prompt: item.prompt,
      fallbackPrompt: item.fallbackPrompt,
      note: item.note,
      platform: item.platform,
      taskClass: item.taskClass,
      sourceName: item.sourceName,
      sourceCategory: item.sourceCategory,
    })),
    modelCatalog: resultsFile.models.map((item) => ({
      modelId: item.id,
      modelAlias: item.alias,
      shortName: item.shortName ?? '',
      logo: item.logo ?? '',
      logoDataUri: item.logoDataUri,
      family: item.family,
    })),
    modelSummaries,
    totals,
    imageDetails,
    generatedAt: resultsFile.generatedAt,
  };
}
