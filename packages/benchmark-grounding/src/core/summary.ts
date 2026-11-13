import { countBy, sum, sumBy } from 'es-toolkit';
import type { Profile, ReportMeta, Result, RunManifest } from './schemas';

const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Zero is a sample; absent, negative and non-finite measurements are not. */
export function summarizeMetric(values: (number | null | undefined)[]) {
  const samples = values.filter(nonnegative);
  if (!samples.length) return { count: 0, average: null, total: 0 };
  return {
    count: samples.length,
    average: Math.min(
      Number.MAX_VALUE,
      sumBy(samples, (value) => value / samples.length),
    ),
    total: Math.min(Number.MAX_VALUE, sum(samples)),
  };
}

/** Model-equally-weighted median, before display rounding or chart transforms. */
export function median(values: (number | null | undefined)[]): number | null {
  const sorted = values.filter(nonnegative).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

function sumKnown(profiles: Profile[], key: keyof Profile): number | undefined {
  const values = profiles.map((profile) => profile[key]).filter(nonnegative);
  return values.length ? Math.min(Number.MAX_VALUE, sum(values)) : undefined;
}

function completeUsage(profiles: Profile[]) {
  return (
    profiles.length > 0 &&
    profiles.every((profile) => profile.usageStatus === 'complete')
  );
}

function ratio(numerator: number, denominator: number | null) {
  if (denominator === null || denominator <= 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

/** Shared by the runner and reporter. All measurements include every attempt. */
export function calculateSummary({
  run,
  results,
  meta,
}: {
  run: RunManifest;
  results: Result[];
  meta?: ReportMeta;
}) {
  const models = run.models.map((model) => {
    const items = results.filter(
      (result) => result.input.displayName === model.displayName,
    );
    const configured = meta?.models?.[model.displayName];
    const reference = configured?.reference;
    const family = configured?.displayFamily ?? 'Other';
    const style = meta?.families?.[family] ?? meta?.families?.Other;
    const profiles = items.map((result) =>
      result.attempts.map((attempt) => attempt.profiling),
    );
    const estimatedCost = summarizeMetric(
      profiles.map((attempts) => {
        if (
          !reference?.pricing ||
          !completeUsage(attempts) ||
          !attempts.every(
            (profile) =>
              nonnegative(profile.totalPromptTokens) &&
              nonnegative(profile.totalCompletionTokens),
          )
        )
          return undefined;
        const price = reference.pricing;
        const conversion =
          price.currency === 'CNY' ? price.usdExchangeRate.cnyPerUsd : 1;
        const cost = sumBy(
          attempts,
          (profile) =>
            ((profile.totalPromptTokens as number) * price.inputPerToken +
              (profile.totalCompletionTokens as number) *
                price.outputPerToken) /
            conversion,
        );
        return nonnegative(cost) ? cost : undefined;
      }),
    );
    const duration = summarizeMetric(
      profiles.map((attempts) => sumKnown(attempts, 'durationMs')),
    );
    const estimatedElapsedTime = summarizeMetric(
      profiles.map((attempts) => {
        const performance = reference?.performance;
        if (
          !performance ||
          !completeUsage(attempts) ||
          !attempts.every((profile) => nonnegative(profile.calls))
        )
          return undefined;
        if (
          !('responseLatencyMs' in performance) &&
          !attempts.every((profile) =>
            nonnegative(profile.totalCompletionTokens),
          )
        )
          return undefined;
        const calls = sumKnown(attempts, 'calls') as number;
        const output = sumKnown(attempts, 'totalCompletionTokens') ?? 0;
        const duration =
          'responseLatencyMs' in performance
            ? calls * performance.responseLatencyMs
            : calls * performance.timeToFirstTokenMs +
              (1000 * Math.max(output - calls, 0)) /
                performance.outputTokensPerSecond;
        return nonnegative(duration) ? duration : undefined;
      }),
    );
    if (estimatedElapsedTime.average !== null && duration.average !== null) {
      estimatedElapsedTime.average = Math.min(
        estimatedElapsedTime.average,
        Math.max(duration.average - 100, 0),
      );
      estimatedElapsedTime.total = Math.min(
        Number.MAX_VALUE,
        estimatedElapsedTime.average * estimatedElapsedTime.count,
      );
    }
    const passed = items.filter((result) => result.output.correct).length;
    const planned = run.tasks.filter(
      (task) => task.model === model.displayName,
    ).length;
    const usage = countBy(profiles, (attempts) =>
      completeUsage(attempts)
        ? 'complete'
        : attempts.some((profile) => profile.usageStatus !== 'missing')
          ? 'partial'
          : 'missing',
    );
    return {
      model: model.displayName,
      modelId: model.name,
      family,
      color: style?.color ?? '#94a3b8',
      ...(style?.logo ? { icon: style.logo } : {}),
      ...(reference ? { reference } : {}),
      planned,
      count: items.length,
      missing: Math.max(planned - items.length, 0),
      passed,
      errors: items.filter((result) => result.output.type === 'ERROR').length,
      score: items.length ? (passed / items.length) * 100 : null,
      duration,
      inputTokens: summarizeMetric(
        profiles.map((attempts) => sumKnown(attempts, 'totalPromptTokens')),
      ),
      outputTokens: summarizeMetric(
        profiles.map((attempts) => sumKnown(attempts, 'totalCompletionTokens')),
      ),
      totalTokens: summarizeMetric(
        profiles.map((attempts) => sumKnown(attempts, 'totalTokens')),
      ),
      estimatedElapsedTime,
      estimatedCost,
      speed: ratio(60_000, estimatedElapsedTime.average),
      affordability: ratio(1, estimatedCost.average),
      usage: {
        complete: usage.complete ?? 0,
        partial: usage.partial ?? 0,
        missing: usage.missing ?? 0,
      },
    };
  });
  const correct = results.filter((result) => result.output.correct).length;
  return {
    planned: run.planned,
    completed: results.length,
    missing: Math.max(run.planned - results.length, 0),
    correct,
    errors: results.filter((result) => result.output.type === 'ERROR').length,
    score: results.length ? (correct / results.length) * 100 : null,
    models,
  };
}
