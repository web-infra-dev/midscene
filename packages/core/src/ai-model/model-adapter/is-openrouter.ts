import type { TModelProvider } from '@midscene/shared/env';

export function isOpenRouter(
  baseURL?: string,
  provider?: TModelProvider,
): boolean {
  if (provider === 'official' && baseURL === 'https://openrouter.ai/api/v1') {
    throw new Error(
      'Provider "official" cannot be used with Base URL https://openrouter.ai/api/v1. Remove the provider setting or set it to "openrouter".',
    );
  }
  if (provider !== undefined) {
    return provider === 'openrouter';
  }
  return baseURL === 'https://openrouter.ai/api/v1';
}
