/** @internal Shared implementation for native platform adapters. */
export type {
  ExplicitXpathFeature,
  NativeXpathCachePlatform,
  UiNode,
  XpathCacheFeature,
  XpathCacheIdentity,
  XpathCacheTarget,
  XpathCacheTargetContext,
  XpathCandidateSource,
  XpathCandidateOptions,
} from './types';
export {
  EXPLICIT_XPATH_FEATURE_KIND,
  NATIVE_XPATH_CACHE_KIND,
  NATIVE_XPATH_CACHE_SCHEMA_VERSION,
} from './types';
export {
  findNodeAtPoint,
  generateXpathCacheFeature,
  generateXpathCandidates,
} from './xpath-tree';
export {
  evaluateXpath,
  findRectByXpath,
  matchRectByXpathCache,
} from './xpath-query';
export type { XmlElement } from './parse-xml';
export { parseXml } from './parse-xml';
export { isNativeXpathCacheEnabled } from './feature-flag';
