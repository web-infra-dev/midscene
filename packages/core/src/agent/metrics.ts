import type { AIUsageInfo } from '@/types';

/**
 * Aggregated usage for a single grouping key (intent or model).
 */
export interface UsageBucket {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

/**
 * Instance-level snapshot of LLM usage accumulated by an Agent.
 *
 * Designed for cost observability: reset at the start of a logical unit
 * (e.g. a test spec) and read back at the end, then push to tools like
 * Langfuse. `byIntent` / `byModel` provide free breakdowns derived from the
 * usage data Midscene already records per call.
 */
export interface MidsceneUsageMetrics {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCachedInput: number;
  totalTimeCostMs: number;
  calls: number;
  byIntent: Record<string, UsageBucket>;
  byModel: Record<string, UsageBucket>;
}

const emptyBucket = (): UsageBucket => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  calls: 0,
});

const addToBucket = (
  map: Record<string, UsageBucket>,
  key: string,
  prompt: number,
  completion: number,
  total: number,
): void => {
  if (!map[key]) {
    map[key] = emptyBucket();
  }
  const bucket = map[key];
  bucket.promptTokens += prompt;
  bucket.completionTokens += completion;
  bucket.totalTokens += total;
  bucket.calls += 1;
};

/**
 * Pure accumulator for {@link AIUsageInfo}. Deduplication of calls is the
 * caller's responsibility; every `add` counts as one call.
 */
export class MetricsCollector {
  private totalPromptTokens = 0;
  private totalCompletionTokens = 0;
  private totalTokens = 0;
  private totalCachedInput = 0;
  private totalTimeCostMs = 0;
  private calls = 0;
  private byIntent: Record<string, UsageBucket> = {};
  private byModel: Record<string, UsageBucket> = {};

  add(usage: AIUsageInfo): void {
    const prompt = usage.prompt_tokens ?? 0;
    const completion = usage.completion_tokens ?? 0;
    const total = usage.total_tokens ?? 0;

    this.totalPromptTokens += prompt;
    this.totalCompletionTokens += completion;
    this.totalTokens += total;
    this.totalCachedInput += usage.cached_input ?? 0;
    this.totalTimeCostMs += usage.time_cost ?? 0;
    this.calls += 1;

    addToBucket(
      this.byIntent,
      usage.intent ?? 'unknown',
      prompt,
      completion,
      total,
    );
    addToBucket(
      this.byModel,
      usage.model_name ?? 'unknown',
      prompt,
      completion,
      total,
    );
  }

  snapshot(): MidsceneUsageMetrics {
    const cloneBuckets = (
      map: Record<string, UsageBucket>,
    ): Record<string, UsageBucket> => {
      const out: Record<string, UsageBucket> = {};
      for (const [key, bucket] of Object.entries(map)) {
        out[key] = { ...bucket };
      }
      return out;
    };

    return {
      totalPromptTokens: this.totalPromptTokens,
      totalCompletionTokens: this.totalCompletionTokens,
      totalTokens: this.totalTokens,
      totalCachedInput: this.totalCachedInput,
      totalTimeCostMs: this.totalTimeCostMs,
      calls: this.calls,
      byIntent: cloneBuckets(this.byIntent),
      byModel: cloneBuckets(this.byModel),
    };
  }

  reset(): void {
    this.totalPromptTokens = 0;
    this.totalCompletionTokens = 0;
    this.totalTokens = 0;
    this.totalCachedInput = 0;
    this.totalTimeCostMs = 0;
    this.calls = 0;
    this.byIntent = {};
    this.byModel = {};
  }
}
