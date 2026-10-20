import type { AIUsageInfo, IReportActionDump } from './types';

export interface ReportModelUsageSummary {
  modelName: string;
  callCount: number;
  promptTokens: number;
  cachedInputTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelCallTimeMs: number;
}

export interface ReportTokenSummary {
  promptTokens: number;
  cachedInputTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ReportTimingSummary {
  /**
   * Elapsed time between the earliest and latest recorded task timestamps.
   * Falls back to `wallTimeFallbackMs` only when no task timestamps exist.
   */
  wallTimeMs?: number;
  wallTimeStart?: number;
  wallTimeEnd?: number;
  wallTimeSource: 'task-timestamps' | 'fallback' | 'unavailable';
  /** Sum of every recorded model request duration. */
  modelCallTimeMs: number;
  modelCallCount: number;
}

export interface ReportSummary {
  timing: ReportTimingSummary;
  tokens: ReportTokenSummary;
  models: ReportModelUsageSummary[];
}

export interface CollectReportSummaryOptions {
  /** Generic fallback for reports without task timestamps, such as test time. */
  wallTimeFallbackMs?: number;
}

const usageKeys = [
  'intent',
  'slot',
  'model_name',
  'response_model_name',
  'model_description',
  'prompt_tokens',
  'cached_input',
  'completion_tokens',
  'total_tokens',
  'time_cost',
  'request_id',
] as const;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function usageValue(usage: AIUsageInfo, key: string): number {
  return Math.max(0, finiteNumber(usage[key]) ?? 0);
}

function hasUsage(usage: AIUsageInfo | undefined): usage is AIUsageInfo {
  return Boolean(
    usage &&
      usageKeys.some((key) => usage[key] !== undefined && usage[key] !== null),
  );
}

function usageTotalTokens(usage: AIUsageInfo): number {
  const explicitTotal = finiteNumber(usage.total_tokens);
  if (explicitTotal !== undefined && explicitTotal > 0) {
    return explicitTotal;
  }
  return (
    usageValue(usage, 'prompt_tokens') + usageValue(usage, 'completion_tokens')
  );
}

function usageModelName(usage: AIUsageInfo): string {
  return (
    usage.model_name ||
    usage.response_model_name ||
    usage.model_description ||
    usage.intent ||
    'Unknown'
  );
}

export function collectReportSummary(
  report: Pick<IReportActionDump, 'executions'>,
  options: CollectReportSummaryOptions = {},
): ReportSummary {
  if (!report || !Array.isArray(report.executions)) {
    throw new Error('collectReportSummary: report.executions must be an array');
  }

  let earliestTimestamp: number | undefined;
  let latestTimestamp: number | undefined;
  let modelCallCount = 0;
  let modelCallTimeMs = 0;
  const models = new Map<string, ReportModelUsageSummary>();

  const addTimestamp = (value: unknown) => {
    const timestamp = finiteNumber(value);
    if (timestamp === undefined) return;
    earliestTimestamp =
      earliestTimestamp === undefined
        ? timestamp
        : Math.min(earliestTimestamp, timestamp);
    latestTimestamp =
      latestTimestamp === undefined
        ? timestamp
        : Math.max(latestTimestamp, timestamp);
  };

  const addUsage = (usage: AIUsageInfo | undefined) => {
    if (!hasUsage(usage)) return;

    const modelName = usageModelName(usage);
    const current = models.get(modelName) ?? {
      modelName,
      callCount: 0,
      promptTokens: 0,
      cachedInputTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      modelCallTimeMs: 0,
    };
    const callTimeMs = usageValue(usage, 'time_cost');

    models.set(modelName, {
      modelName,
      callCount: current.callCount + 1,
      promptTokens: current.promptTokens + usageValue(usage, 'prompt_tokens'),
      cachedInputTokens:
        current.cachedInputTokens + usageValue(usage, 'cached_input'),
      completionTokens:
        current.completionTokens + usageValue(usage, 'completion_tokens'),
      totalTokens: current.totalTokens + usageTotalTokens(usage),
      modelCallTimeMs: current.modelCallTimeMs + callTimeMs,
    });
    modelCallCount += 1;
    modelCallTimeMs += callTimeMs;
  };

  for (const execution of report.executions) {
    for (const task of execution.tasks) {
      addTimestamp(task.timing?.start);
      addTimestamp(task.timing?.end);
      addUsage(task.usage);
      addUsage(task.searchAreaUsage);
    }
  }

  const modelSummaries = Array.from(models.values());
  const tokens = modelSummaries.reduce<ReportTokenSummary>(
    (total, model) => ({
      promptTokens: total.promptTokens + model.promptTokens,
      cachedInputTokens: total.cachedInputTokens + model.cachedInputTokens,
      completionTokens: total.completionTokens + model.completionTokens,
      totalTokens: total.totalTokens + model.totalTokens,
    }),
    {
      promptTokens: 0,
      cachedInputTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  );

  const fallback = finiteNumber(options.wallTimeFallbackMs);
  const hasFallback = fallback !== undefined && fallback >= 0;
  let wallTimeMs: number | undefined;
  let wallTimeSource: ReportTimingSummary['wallTimeSource'];

  if (earliestTimestamp !== undefined && latestTimestamp !== undefined) {
    wallTimeMs = Math.max(0, latestTimestamp - earliestTimestamp);
    wallTimeSource = 'task-timestamps';
  } else if (hasFallback) {
    wallTimeMs = fallback;
    wallTimeSource = 'fallback';
  } else {
    wallTimeSource = 'unavailable';
  }

  return {
    timing: {
      wallTimeMs,
      wallTimeStart:
        wallTimeSource === 'task-timestamps' ? earliestTimestamp : undefined,
      wallTimeEnd:
        wallTimeSource === 'task-timestamps' ? latestTimestamp : undefined,
      wallTimeSource,
      modelCallTimeMs,
      modelCallCount,
    },
    tokens,
    models: modelSummaries,
  };
}
