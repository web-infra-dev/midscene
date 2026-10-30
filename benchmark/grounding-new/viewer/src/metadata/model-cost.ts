/**
 * Reference snapshots, keyed by evaluation displayName, falling back to name
 * when no displayName is configured (input.displayName ?? input.model).
 * Prefer OpenRouter for both pricing and performance. Use official sources
 * only for metrics unavailable on OpenRouter, with their source and conditions
 * recorded explicitly. Do not substitute a different model to fill a gap.
 * Ark release IDs map to the corresponding OpenRouter model pages; provider
 * release suffixes do not establish identical serving snapshots across hosts.
 * OpenRouter prices use the page header's IN / OUT PRICE, converted from USD per million
 * to USD per token. This is a common comparison baseline: no cache discounts,
 * context-length tiers, or provider-specific adjustments are applied.
 *
 * OpenRouter performance uses the two separate P50 best cards: maximum output throughput
 * and minimum latency (TTFT). These may come from different providers/tiers;
 * together with the headline prices, they do not describe one purchasable plan.
 * The cards do not state their sampling window; observedAt is retrieval time.
 * Doubao Seed releases without a verified matching OpenRouter snapshot use
 * Ark's standard CNY prices and official leaderboard means. Their throughput
 * is the reciprocal of mean TPOT, not a P50 or mean throughput. Input length,
 * time window and currency conversion are recorded below; this exception is
 * not directly comparable to best P50.
 *
 * Estimate input and output cost separately per testcase, then add them before
 * taking the arithmetic mean. Each metric includes finite non-negative values
 * from every outcome and counts its own valid samples.
 * Estimate serial-call latency using calls * TTFT + subsequent output / TPS.
 * Decision models with a complete-response latency reference instead use
 * calls * response latency; no output TPS is inferred for them.
 * Input tokens are not output tokens and must not be divided by output TPS.
 * Completion totals do not separate reasoning, which may overlap TTFT.
 * These are reference estimates, not measured means, P50 latency, or invoices.
 */
export const modelCosts = {
  'jev-1.14': {
    // ModelHub returned jev-1.14.0 for request ID typesafe-jev during the smoke run.
    source: 'OpenRouter',
    url: 'https://openrouter.ai/typesafe/jev-1.14',
    observedAt: '2026-10-27T03:39:40.466Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 0.042 / 1_000_000,
      outputPerToken: 0,
    },
    performance: {
      basis: 'best-response-latency',
      percentile: 'p50',
      // Complete round-trip latency, not TTFT. The reference is not specific
      // to image or Box requests; OpenRouter provides no output TPS for Jev.
      responseLatencyMs: 80,
    },
  },
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
  'qwen3.8-max': {
    // OpenRouter's qwen3.8-max URL currently redirects to the 0902 snapshot.
    // Evaluation results do not record ModelHub's serving snapshot ID.
    source: 'OpenRouter',
    url: 'https://openrouter.ai/qwen/qwen3.8-max-0902',
    observedAt: '2026-10-28T03:35:44Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 2 / 1_000_000,
      outputPerToken: 6 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 2_200,
      outputTokensPerSecond: 35,
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
  'gpt-6-astra': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/openai/gpt-6-astra',
    observedAt: '2026-10-26T09:30:23Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 10 / 1_000_000,
      outputPerToken: 50 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 1_170,
      outputTokensPerSecond: 62,
    },
  },
  'gpt-6-luna': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/openai/gpt-6-luna',
    observedAt: '2026-10-26T09:30:23Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 0.1 / 1_000_000,
      outputPerToken: 0.5 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 1_340,
      outputTokensPerSecond: 116,
    },
  },
  'gpt-6.1-sol': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/openai/gpt-6.1-sol',
    observedAt: '2026-10-26T09:30:23Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 2 / 1_000_000,
      outputPerToken: 10 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 2_180,
      outputTokensPerSecond: 98,
    },
  },
  'gpt-5.6-sol': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/openai/gpt-5.6-sol',
    observedAt: '2026-10-26T09:30:23Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 4 / 1_000_000,
      outputPerToken: 20 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 3_090,
      outputTokensPerSecond: 109,
    },
  },
  'gpt-5.6-terra': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/openai/gpt-5.6-terra',
    observedAt: '2026-10-26T09:30:23Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 2 / 1_000_000,
      outputPerToken: 12 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 940,
      outputTokensPerSecond: 100,
    },
  },
  'gpt-5.6-luna': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/openai/gpt-5.6-luna',
    observedAt: '2026-10-26T09:30:23Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 0.2 / 1_000_000,
      outputPerToken: 1.2 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 640,
      outputTokensPerSecond: 109,
    },
  },
  'qwen3.7-plus': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/qwen/qwen3.7-plus',
    observedAt: '2026-10-26T09:30:24Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 0.32 / 1_000_000,
      outputPerToken: 1.28 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 1_370,
      outputTokensPerSecond: 49,
    },
  },
  'qwen3.6-plus': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/qwen/qwen3.6-plus',
    observedAt: '2026-10-26T09:30:24Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 0.325 / 1_000_000,
      outputPerToken: 1.95 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 1_110,
      outputTokensPerSecond: 45,
    },
  },
  'gemini-4-argon': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/google/gemini-4-argon',
    observedAt: '2026-10-26T03:11:24Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 2 / 1_000_000,
      outputPerToken: 10 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 3_310,
      outputTokensPerSecond: 59,
    },
  },
  'gemini-3.8-flash': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/google/gemini-3.8-flash',
    observedAt: '2026-10-29T09:16:43Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 0.75 / 1_000_000,
      outputPerToken: 3.75 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 2_240,
      outputTokensPerSecond: 87,
    },
  },
  'deepseek-v4-1-flash-261017': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017',
    observedAt: '2026-10-26T03:36:32Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 0.02 / 1_000_000,
      outputPerToken: 1 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 250,
      outputTokensPerSecond: 234,
    },
  },
  'doubao-seed-2-0-lite-260428': {
    source: 'Volcengine Ark',
    url: 'https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing',
    observedAt: '2026-10-28T07:40:37Z',
    pricing: {
      basis: 'standard-online-inference',
      currency: 'CNY',
      // Public non-audio rates for 0–32k input tokens, without cache discounts.
      inputPerToken: 0.6 / 1_000_000,
      outputPerToken: 3.6 / 1_000_000,
      usdExchangeRate: {
        source: 'Bank of China reference rate',
        url: 'https://www.boc.cn/sourcedb/whpj/',
        quotedAt: '2026-10-26T11:13:43+08:00',
        cnyPerUsd: 6.7162,
      },
    },
    performance: {
      basis: 'window-mean',
      url: 'https://console.volcengine.com/ark/region:cn-beijing/model/leaderboard',
      observedAt: '2026-10-28T07:40:37Z',
      conditions:
        'Standard inference, 10k input tokens, trailing 6 hours, thinking disabled, no cache hits',
      timeToFirstTokenMs: 2_013,
      // Ark reports mean TPOT of 19.6 ms per subsequent output token.
      outputTokensPerSecond: 1000 / 19.6,
    },
  },
  'doubao-seed-2-0-mini-260428': {
    source: 'Volcengine Ark',
    url: 'https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing',
    observedAt: '2026-10-28T07:40:37Z',
    pricing: {
      basis: 'standard-online-inference',
      currency: 'CNY',
      // Public non-audio rates for 0–32k input tokens, without cache discounts.
      inputPerToken: 0.2 / 1_000_000,
      outputPerToken: 2 / 1_000_000,
      usdExchangeRate: {
        source: 'Bank of China reference rate',
        url: 'https://www.boc.cn/sourcedb/whpj/',
        quotedAt: '2026-10-26T11:13:43+08:00',
        cnyPerUsd: 6.7162,
      },
    },
    performance: {
      basis: 'window-mean',
      url: 'https://console.volcengine.com/ark/region:cn-beijing/model/leaderboard',
      observedAt: '2026-10-28T07:40:37Z',
      conditions:
        'Standard inference, 10k input tokens, trailing 6 hours, thinking disabled, no cache hits',
      timeToFirstTokenMs: 711,
      // Ark reports mean TPOT of 9.6 ms per subsequent output token.
      outputTokensPerSecond: 1000 / 9.6,
    },
  },
  'doubao-seed-2-1-pro-260915': {
    source: 'Volcengine Ark',
    url: 'https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing',
    observedAt: '2026-10-26T09:33:15Z',
    pricing: {
      basis: 'standard-online-inference',
      currency: 'CNY',
      // Public non-audio rates for 0–1024k input tokens, without cache discounts.
      inputPerToken: 6 / 1_000_000,
      outputPerToken: 30 / 1_000_000,
      usdExchangeRate: {
        source: 'Bank of China reference rate',
        url: 'https://www.boc.cn/sourcedb/whpj/',
        quotedAt: '2026-10-26T11:13:43+08:00',
        cnyPerUsd: 6.7162,
      },
    },
    performance: {
      basis: 'window-mean',
      url: 'https://console.volcengine.com/ark/region:cn-beijing/model/leaderboard',
      observedAt: '2026-10-27T02:30:40Z',
      conditions:
        'Standard inference, 10k input tokens, trailing 6 hours, thinking disabled, no cache hits',
      // Exact 260915 release, available in the expanded TTFT/TPOT rankings.
      timeToFirstTokenMs: 1_828,
      // Ark reports mean TPOT of 24.4 ms per subsequent output token.
      outputTokensPerSecond: 1000 / 24.4,
    },
  },
  'doubao-seed-2-1-lite-260915': {
    source: 'Volcengine Ark',
    url: 'https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing',
    observedAt: '2026-10-26T09:33:15Z',
    pricing: {
      basis: 'standard-online-inference',
      currency: 'CNY',
      // Public non-audio rates for 0–1024k input tokens, without cache discounts.
      inputPerToken: 0.8 / 1_000_000,
      outputPerToken: 2.7 / 1_000_000,
      usdExchangeRate: {
        source: 'Bank of China reference rate',
        url: 'https://www.boc.cn/sourcedb/whpj/',
        quotedAt: '2026-10-26T11:13:43+08:00',
        cnyPerUsd: 6.7162,
      },
    },
    performance: {
      basis: 'window-mean',
      url: 'https://console.volcengine.com/ark/region:cn-beijing/model/leaderboard',
      observedAt: '2026-10-26T09:37:00Z',
      conditions:
        'Standard inference, 10k input tokens, trailing 6 hours, thinking disabled, no cache hits',
      timeToFirstTokenMs: 1_109,
      // Ark reports mean TPOT of 17.5 ms per subsequent output token.
      outputTokensPerSecond: 1000 / 17.5,
    },
  },
  'doubao-seed-2-1-turbo-260628': {
    source: 'Volcengine Ark',
    url: 'https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing',
    observedAt: '2026-10-26T09:33:15Z',
    pricing: {
      basis: 'standard-online-inference',
      currency: 'CNY',
      // Public non-audio rates for 0–256k input tokens, without cache discounts.
      inputPerToken: 3 / 1_000_000,
      outputPerToken: 15 / 1_000_000,
      usdExchangeRate: {
        source: 'Bank of China reference rate',
        url: 'https://www.boc.cn/sourcedb/whpj/',
        quotedAt: '2026-10-26T11:13:43+08:00',
        cnyPerUsd: 6.7162,
      },
    },
    // OpenRouter's Turbo canonical version is 20260810; equivalence to
    // Ark's 260628 release is unverified, so its performance is not substituted.
    performance: {
      basis: 'window-mean',
      url: 'https://console.volcengine.com/ark/region:cn-beijing/model/leaderboard',
      observedAt: '2026-10-26T09:37:00Z',
      conditions:
        'Standard inference, 10k input tokens, trailing 6 hours, thinking disabled, no cache hits',
      timeToFirstTokenMs: 3_591,
      // Ark reports mean TPOT of 21.5 ms per subsequent output token.
      outputTokensPerSecond: 1000 / 21.5,
    },
  },
  'kimi-k3': {
    source: 'OpenRouter',
    url: 'https://openrouter.ai/moonshotai/kimi-k3',
    observedAt: '2026-10-29T08:26:43Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 0.1824 / 1_000_000,
      outputPerToken: 9.339 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 460,
      outputTokensPerSecond: 113,
    },
  },
  'kimi-k3-1-pro-261024': {
    // Ark's Kimi K3.1 Pro release maps to OpenRouter's K3.1 Pro model page.
    // OpenRouter identifies its canonical release as kimi-k3.1-pro-20261023.
    source: 'OpenRouter',
    url: 'https://openrouter.ai/moonshotai/kimi-k3.1-pro',
    observedAt: '2026-10-26T09:49:51Z',
    pricing: {
      basis: 'model-page-header',
      currency: 'USD',
      inputPerToken: 2 / 1_000_000,
      outputPerToken: 10 / 1_000_000,
    },
    performance: {
      basis: 'best-per-metric',
      percentile: 'p50',
      timeToFirstTokenMs: 6_200,
      outputTokensPerSecond: 33,
    },
  },
  'doubao-seed-evolving': {
    source: 'Volcengine Ark',
    url: 'https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing',
    observedAt: '2026-10-26T03:42:49Z',
    pricing: {
      basis: 'standard-online-inference',
      currency: 'CNY',
      // Public non-audio rates, without account or cache discounts.
      inputPerToken: 6 / 1_000_000,
      outputPerToken: 30 / 1_000_000,
      usdExchangeRate: {
        source: 'Bank of China reference rate',
        url: 'https://www.boc.cn/sourcedb/whpj/',
        quotedAt: '2026-10-26T11:13:43+08:00',
        // The source quotes CNY 671.62 per USD 100.
        cnyPerUsd: 6.7162,
      },
    },
    performance: {
      basis: 'window-mean',
      url: 'https://ark.volcengine.com/region:cn-beijing/model/leaderboard',
      observedAt: '2026-10-26T03:41:21Z',
      conditions:
        '10k input tokens, trailing 6 hours, thinking disabled, no cache hits',
      timeToFirstTokenMs: 2_352,
      // Ark reports mean TPOT of 23.1 ms per subsequent output token.
      outputTokensPerSecond: 1000 / 23.1,
    },
  },
} as const;
