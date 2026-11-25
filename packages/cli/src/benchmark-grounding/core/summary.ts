import { countBy, sum, sumBy } from 'es-toolkit';
import type { Profile, ReportMeta, Result } from './schemas';

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
  if (denominator === null || !Number.isFinite(denominator) || denominator <= 0)
    return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

function summarizeEconomy(
  profiles: Profile[],
  pricing?: { inputPerToken: number; outputPerToken: number },
): { economy: number | 'free' | null; economyCount: number } {
  if (!pricing || !profiles.length) return { economy: null, economyCount: 0 };
  const { inputPerToken, outputPerToken } = pricing;
  if (inputPerToken === 0 && outputPerToken === 0)
    return { economy: 'free', economyCount: profiles.length };

  let inputTokens = 0;
  let outputTokens = 0;
  let economyCount = 0;
  for (const profile of profiles) {
    const { usageStatus, totalPromptTokens, totalCompletionTokens } = profile;
    if (
      usageStatus !== 'complete' ||
      !nonnegative(totalPromptTokens) ||
      !nonnegative(totalCompletionTokens)
    )
      continue;
    inputTokens += totalPromptTokens;
    outputTokens += totalCompletionTokens;
    economyCount++;
  }
  if (!economyCount) return { economy: null, economyCount };

  const estimatedSpend =
    inputTokens * inputPerToken + outputTokens * outputPerToken;
  return {
    economy:
      estimatedSpend === 0 ? 'free' : ratio(economyCount, estimatedSpend),
    economyCount,
  };
}

export function calculateSummary({
  models: modelNames,
  testcaseCount,
  results,
  meta,
}: {
  models: string[];
  testcaseCount: number;
  results: Result[];
  meta?: ReportMeta;
}) {
  const models = modelNames.map((model) => {
    const items = results.filter(
      (result) => result.input.displayName === model,
    );
    const startTimes = items
      .map(({ profiling }) => profiling.startTime)
      .filter(nonnegative);
    const configured = meta?.models?.[model];
    const reference = configured?.reference;
    const performanceReference = reference?.performance;
    const family = configured?.displayFamily ?? 'Other';
    const style = meta?.families?.[family] ?? meta?.families?.Other;
    const profiles = items.map((result) =>
      result.attempts.map((attempt) => attempt.profiling),
    );
    const completedProfiles = items.flatMap(({ attempts }) => {
      const final = attempts.at(-1);
      return final && final.output.type !== 'ERROR' ? [final.profiling] : [];
    });
    const economy = summarizeEconomy(completedProfiles, reference?.pricing);
    const duration = summarizeMetric(
      completedProfiles.map(({ durationMs }) => durationMs),
    );
    const performanceMs = summarizeMetric(
      completedProfiles.map(
        ({ durationMs, usageStatus, calls, totalCompletionTokens }) => {
          if (
            !performanceReference ||
            !('outputTokensPerSecond' in performanceReference) ||
            usageStatus !== 'complete' ||
            !nonnegative(calls) ||
            !nonnegative(totalCompletionTokens)
          ) {
            return durationMs;
          }
          return Math.min(
            durationMs,
            calls * performanceReference.timeToFirstTokenMs +
              (totalCompletionTokens /
                performanceReference.outputTokensPerSecond) *
                1000,
          );
        },
      ),
    );
    const performance = {
      count: performanceMs.count,
      average:
        performanceMs.average === null ? null : performanceMs.average / 1000,
      total: performanceMs.total / 1000,
    };
    const passed = items.filter((result) => result.output.correct).length;
    const usage = countBy(profiles, (attempts) =>
      completeUsage(attempts)
        ? 'complete'
        : attempts.some((profile) => profile.usageStatus !== 'missing')
          ? 'partial'
          : 'missing',
    );
    return {
      model,
      modelId: configured?.name ?? items[0]?.input.model,
      snapshotIds: [
        ...new Set(items.flatMap((item) => item.profiling.snapshotIds ?? [])),
      ].sort(),
      startTimeRange: startTimes.length
        ? [Math.min(...startTimes), Math.max(...startTimes)]
        : null,
      family,
      color: style?.color ?? '#94a3b8',
      ...(style?.logo ? { icon: style.logo } : {}),
      ...(reference ? { reference } : {}),
      total: testcaseCount,
      count: items.length,
      missing: Math.max(testcaseCount - items.length, 0),
      passed,
      errors: items.filter((result) => result.output.type === 'ERROR').length,
      accuracy: items.length ? (passed / items.length) * 100 : null,
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
      performance,
      ...economy,
      casesPerMinute: ratio(60_000, performanceMs.average),
      usage: {
        complete: usage.complete ?? 0,
        partial: usage.partial ?? 0,
        missing: usage.missing ?? 0,
      },
    };
  });
  const correct = results.filter((result) => result.output.correct).length;
  const total = modelNames.length * testcaseCount;
  return {
    total,
    count: results.length,
    missing: Math.max(total - results.length, 0),
    correct,
    errors: results.filter((result) => result.output.type === 'ERROR').length,
    accuracy: results.length ? (correct / results.length) * 100 : null,
    models,
  };
}
