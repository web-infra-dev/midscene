import type { AgentOpt, CacheConfig } from '../types';
import { processCacheConfig } from '../utils';

type CacheStrategy = NonNullable<CacheConfig['strategy']>;

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
}

/**
 * Process cache configuration and return normalized cache settings
 */
export function normalizeAgentCacheConfig(opts: AgentOpt): {
  id: string;
  enabled: boolean;
  readOnly: boolean;
  writeOnly: boolean;
  cacheDir?: string;
} | null {
  validateAgentCacheInput(opts.cache);

  // Use the unified utils function to process cache configuration
  const cacheConfig = processCacheConfig(opts.cache, opts.cacheId || 'default');

  if (!cacheConfig) {
    return null;
  }

  // Handle cache configuration object
  if (typeof cacheConfig === 'object' && cacheConfig !== null) {
    const id = cacheConfig.id;
    const strategyValue = cacheConfig.strategy ?? 'read-write';
    const isReadOnly = strategyValue === 'read-only';
    const isWriteOnly = strategyValue === 'write-only';

    return {
      id,
      enabled: !isWriteOnly,
      readOnly: isReadOnly,
      writeOnly: isWriteOnly,
      cacheDir: cacheConfig.cacheDir?.trim(),
    };
  }

  return null;
}
