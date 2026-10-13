import { collectReportSummary } from '../../report-stats';
import type { TestRunReportMetrics } from '../../test-run-report';
import type { AIUsageInfo, IReportActionDump } from '../../types';

/** A captured execution can still lack provider usage or contain a live request. */
export function collectTestRunReportMetrics(
  report: Pick<IReportActionDump, 'executions'>,
): TestRunReportMetrics {
  const summary = collectReportSummary(report);
  const tasks = report.executions.flatMap((execution) => execution.tasks);
  const hasUsage = (usage: AIUsageInfo | undefined): usage is AIUsageInfo =>
    !!usage &&
    Object.values(usage).some((value) => value !== undefined && value !== null);
  const usages = tasks.flatMap((task) =>
    [task.usage, task.searchAreaUsage].filter(hasUsage),
  );
  const live = tasks.some(
    (task) =>
      task.timing?.callAiStart !== undefined &&
      (task.status === 'pending' || task.status === 'running'),
  );
  const unrecorded = tasks.some(
    (task) => task.timing?.callAiStart !== undefined && !hasUsage(task.usage),
  );
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const knownTimes = usages.filter((usage) => number(usage.time_cost)).length;
  const knownTokens = usages.filter(
    (usage) =>
      number(usage.total_tokens) ||
      (number(usage.prompt_tokens) && number(usage.completion_tokens)),
  ).length;
  const reasons: string[] = [];
  if (live)
    reasons.push('A model request was still running when usage was captured.');
  if (unrecorded)
    reasons.push('A model request started but its usage was not recorded.');
  if (knownTimes < usages.length)
    reasons.push('Some model usage records do not include request duration.');
  if (knownTokens < usages.length)
    reasons.push('Some model usage records do not include token counts.');
  const state = (
    known: number,
    missing: boolean,
  ): 'complete' | 'partial' | 'unknown' =>
    missing ? (known > 0 ? 'partial' : 'unknown') : 'complete';
  const fields = {
    modelCallCount: state(summary.timing.modelCallCount, live || unrecorded),
    modelTimeMs: state(
      knownTimes,
      live || unrecorded || knownTimes < usages.length,
    ),
    totalTokens: state(
      knownTokens,
      live || unrecorded || knownTokens < usages.length,
    ),
  };
  return {
    modelCallCount: summary.timing.modelCallCount,
    modelTimeMs: summary.timing.modelCallTimeMs,
    ...summary.tokens,
    collection: {
      status: reasons.length
        ? summary.timing.modelCallCount > 0
          ? 'partial'
          : 'unknown'
        : 'complete',
      expectedExecutionCount: 0,
      capturedExecutionCount: 0,
      reasons,
      fields,
    },
  };
}

/** Add usage facts without treating missing screenshots as missing model calls. */
export function sumTestRunReportMetrics(
  values: readonly TestRunReportMetrics[],
  missingReasons: readonly string[] = [],
): TestRunReportMetrics {
  const total: TestRunReportMetrics = {
    modelCallCount: 0,
    modelTimeMs: 0,
    promptTokens: 0,
    cachedInputTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  for (const value of values)
    for (const key of Object.keys(total) as (keyof typeof total)[])
      if (key !== 'collection') total[key] += value[key];
  const fields = Object.fromEntries(
    (['modelCallCount', 'modelTimeMs', 'totalTokens'] as const).map((field) => {
      const states = values.map(
        (value) =>
          value.collection?.fields?.[field] ??
          value.collection?.status ??
          'complete',
      );
      if (missingReasons.length) states.push('unknown');
      return [
        field,
        states.every((state) => state === 'complete')
          ? 'complete'
          : states.every((state) => state === 'unknown')
            ? 'unknown'
            : 'partial',
      ];
    }),
  ) as NonNullable<TestRunReportMetrics['collection']>['fields'] & {};
  total.collection = {
    status: Object.values(fields).every((state) => state === 'complete')
      ? 'complete'
      : Object.values(fields).every((state) => state === 'unknown')
        ? 'unknown'
        : 'partial',
    fields,
    expectedExecutionCount: 0,
    capturedExecutionCount: 0,
    reasons: [
      ...new Set([
        ...values.flatMap((value) => value.collection?.reasons ?? []),
        ...missingReasons,
      ]),
    ],
  };
  return total;
}
