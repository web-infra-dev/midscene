import type { AgentOpt, CacheConfig } from '../types';

type CacheStrategy = NonNullable<CacheConfig['strategy']>;
type CacheVerifyMode = Exclude<NonNullable<CacheConfig['verify']>, false>;

const CACHE_STRATEGIES: readonly CacheStrategy[] = [
  'read-only',
  'read-write',
  'write-only',
];

const isValidCacheStrategy = (strategy: string): strategy is CacheStrategy =>
  CACHE_STRATEGIES.some((value) => value === strategy);

const CACHE_STRATEGY_VALUES = CACHE_STRATEGIES.map(
  (value) => `"${value}"`,
).join(', ');

const CACHE_VERIFY_MODES: readonly CacheVerifyMode[] = ['action'];
const CACHE_VERIFY_MODE_VALUES = CACHE_VERIFY_MODES.map(
  (value) => `"${value}"`,
).join(', ');

export function validateAgentCacheInput(cache: AgentOpt['cache']): void {
  // Agent requires explicit IDs - don't allow auto-generation.
  if (cache === true) {
    throw new Error(
      'cache: true requires an explicit cache ID. Please provide:\n' +
        'Example: cache: { id: "my-cache-id" }',
    );
  }

  if (!cache || typeof cache !== 'object') {
    return;
  }

  if (!cache.id) {
    throw new Error(
      'cache configuration requires an explicit id.\n' +
        'Example: cache: { id: "my-cache-id" }',
    );
  }

  if (
    cache.cacheDir !== undefined &&
    (typeof cache.cacheDir !== 'string' || !cache.cacheDir.trim())
  ) {
    throw new Error(
      'cache.cacheDir must be a non-empty string when provided.\n' +
        'Example: cache: { id: "my-cache-id", cacheDir: "./my-cache-dir" }',
    );
  }

  const rawStrategy = cache.strategy as unknown;
  if (rawStrategy !== undefined && typeof rawStrategy !== 'string') {
    throw new Error(
      `cache.strategy must be a string when provided, but received type ${typeof rawStrategy}`,
    );
  }

  if (rawStrategy !== undefined && !isValidCacheStrategy(rawStrategy)) {
    throw new Error(
      `cache.strategy must be one of ${CACHE_STRATEGY_VALUES}, but received "${rawStrategy}"`,
    );
  }

  const rawVerify = cache.verify as unknown;
  if (
    rawVerify !== undefined &&
    rawVerify !== false &&
    typeof rawVerify !== 'string'
  ) {
    throw new Error(
      `cache.verify must be false or a string when provided, but received type ${typeof rawVerify}`,
    );
  }

  if (
    rawVerify !== undefined &&
    rawVerify !== false &&
    !CACHE_VERIFY_MODES.some((value) => value === rawVerify)
  ) {
    throw new Error(
      `cache.verify must be false or one of ${CACHE_VERIFY_MODE_VALUES}, but received "${rawVerify}"`,
    );
  }
}
