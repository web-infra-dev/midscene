import type {
  TestRunReportAgentDetail,
  TestRunReportMetrics,
  TestRunReportStep,
} from '@midscene/core';
import { collectReportSummary } from '@midscene/core/report-stats';
import type { PlaywrightTasks } from '../../types';

type CollectionStatus = 'complete' | 'partial' | 'unknown';

export interface TokenUsageSummary {
  totalTokens: number;
  promptTokens: number;
  cachedInputTokens: number;
  completionTokens: number;
  modelCallCount: number;
  status: CollectionStatus;
  callStatus: CollectionStatus;
}

export function getRunTokenUsage(
  metrics: TestRunReportMetrics,
  fallback: CollectionStatus = 'unknown',
): TokenUsageSummary {
  return {
    ...metrics,
    status:
      metrics.collection?.fields?.totalTokens ??
      metrics.collection?.status ??
      fallback,
    callStatus:
      metrics.collection?.fields?.modelCallCount ??
      metrics.collection?.status ??
      fallback,
  };
}

export function getStepsTokenUsage(
  steps: TestRunReportStep[],
): TokenUsageSummary {
  const result: TokenUsageSummary = {
    totalTokens: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    modelCallCount: 0,
    status: 'complete',
    callStatus: 'complete',
  };
  let knownTokens = false;
  let knownCalls = false;
  let incompleteTokens = false;
  let incompleteCalls = false;
  for (const step of steps) {
    if (step.status === 'not-run') continue;
    if (!step.metrics) {
      if (
        step.agentDetails?.length ||
        step.evidenceCollection?.modelUsageUnavailable
      ) {
        incompleteTokens = true;
        incompleteCalls = true;
      }
      continue;
    }
    const usage = getRunTokenUsage(step.metrics, 'complete');
    incompleteTokens ||= usage.status !== 'complete';
    incompleteCalls ||= usage.callStatus !== 'complete';
    if (usage.status !== 'unknown') {
      knownTokens = true;
      result.totalTokens += usage.totalTokens;
      result.promptTokens += usage.promptTokens;
      result.cachedInputTokens += usage.cachedInputTokens;
      result.completionTokens += usage.completionTokens;
    }
    if (usage.callStatus !== 'unknown') {
      knownCalls = true;
      result.modelCallCount += usage.modelCallCount;
    }
  }
  result.status = incompleteTokens
    ? knownTokens
      ? 'partial'
      : 'unknown'
    : 'complete';
  result.callStatus = incompleteCalls
    ? knownCalls
      ? 'partial'
      : 'unknown'
    : 'complete';
  return result;
}

// Model names live in Agent recordings; totals remain authoritative in Step/run
// metrics even when those recordings are unavailable.
export function getRecordedModelUsage(
  reports: PlaywrightTasks[],
  details?: TestRunReportAgentDetail[],
) {
  const seen = new Set<string | PlaywrightTasks>();
  return collectReportSummary({
    executions: reports.flatMap((report) => {
      const key = report.reportId ?? report;
      if (seen.has(key)) return [];
      seen.add(key);
      const selected = details
        ?.filter((detail) => detail.reportId === report.reportId)
        .map((detail) => detail.executionId);
      if (selected && !selected.length) return [];
      return report
        .get()
        .executions.filter(
          (execution) => !selected || selected.includes(execution.id!),
        );
    }),
  }).models;
}
