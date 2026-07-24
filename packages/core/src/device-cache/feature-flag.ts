import {
  MIDSCENE_EXPERIMENTAL_NATIVE_XPATH_CACHE,
  globalConfigManager,
} from '@midscene/shared/env';

/** Native XPath replay is merged dark until the platform rollout is enabled. */
export function isNativeXpathCacheEnabled(): boolean {
  return globalConfigManager.getEnvConfigInBoolean(
    MIDSCENE_EXPERIMENTAL_NATIVE_XPATH_CACHE,
  );
}
