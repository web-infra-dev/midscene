/**
 * OpenRouter model-page snapshots, matched by exact model ID.
 * Prices use the page header's IN / OUT PRICE, converted from USD per million
 * to USD per token. This is a common comparison baseline: no cache discounts,
 * context-length tiers, or provider-specific adjustments are applied.
 *
 * Performance uses the two separate P50 best cards: maximum output throughput
 * and minimum latency (TTFT). These may come from different providers/tiers;
 * together with the headline prices, they do not describe one purchasable plan.
 * The cards do not state their sampling window; observedAt is retrieval time.
 *
 * Estimate input and output cost separately per testcase, then add them before
 * averaging total cost. Geometric means of the two parts must not be added.
 * Estimate serial-call latency using calls * TTFT + subsequent output / TPS.
 * Input tokens are not output tokens and must not be divided by output TPS.
 * Completion totals do not separate reasoning, which may overlap TTFT.
 * These are reference estimates, not measured means, P50 latency, or invoices.
 */
export const modelCosts = {
  'gpt-6-sol': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/openai/gpt-6-sol',
    observedAt: '2026-10-23T01:47:14Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 2 / 1_000_000,
      outputPerToken: 10 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 1_670,
      outputTokensPerSecond: 103,
    },
  },
  'qwen3.8-flash': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/qwen/qwen3.8-flash',
    observedAt: '2026-10-23T01:47:04Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 0.15 / 1_000_000,
      outputPerToken: 0.47 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 1_660,
      outputTokensPerSecond: 52,
    },
  },
} as const;
