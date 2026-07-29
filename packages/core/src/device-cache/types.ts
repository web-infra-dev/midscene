import type { Rect } from '@midscene/shared/types';

/**
 * Generic UI tree node used by non-web platforms (iOS, Android, HarmonyOS,
 * desktop) to feed the shared xpath cache pipeline. Each platform adapter is
 * responsible for parsing its native accessibility / UI inspector payload into
 * this shape; the xpath generator and query evaluator only ever see UiNode.
 *
 * `bounds` must be in the same logical coordinate space the rest of Midscene
 * expects (i.e. before the screenshot shrink ratio is applied). Off-screen or
 * zero-sized nodes are allowed but will be skipped by the point-hit search.
 */
export interface UiNode {
  type: string;
  attrs: Record<string, string | undefined>;
  bounds: Rect;
  children: UiNode[];
}

export interface XpathCacheIdentity {
  attr: string;
  value: string;
}

export interface XpathCacheTargetContext extends XpathCacheIdentity {
  type: string;
  additionalAttrs?: XpathCacheIdentity[];
}

/** Exact identity that a replayed native xpath must still satisfy. */
export interface XpathCacheTarget extends XpathCacheTargetContext {
  /**
   * Optional stable ancestor used to scope an otherwise repeated child label.
   * Replay still requires the complete child + ancestor fingerprint to resolve
   * to exactly one node.
   */
  ancestor?: XpathCacheTargetContext;
}

export const NATIVE_XPATH_CACHE_KIND = 'native-xpath' as const;
export const NATIVE_XPATH_CACHE_SCHEMA_VERSION = 1 as const;
export const EXPLICIT_XPATH_FEATURE_KIND = 'explicit-xpath' as const;

export type NativeXpathCachePlatform =
  | 'android'
  | 'ios'
  | 'harmony'
  | 'darwin'
  | 'win32'
  | 'linux';

export type ExplicitXpathFeature = Record<string, unknown> & {
  kind: typeof EXPLICIT_XPATH_FEATURE_KIND;
  xpaths: string[];
};

export type XpathCandidateSource =
  | 'stable-attribute'
  | 'semantic-attribute'
  | 'compound-attributes'
  | 'ancestor-scoped'
  | 'positional-fallback';

/** Native element cache payload written by the shared xpath cache pipeline. */
export type XpathCacheFeature = Record<string, unknown> & {
  kind: typeof NATIVE_XPATH_CACHE_KIND;
  schemaVersion: typeof NATIVE_XPATH_CACHE_SCHEMA_VERSION;
  platform: NativeXpathCachePlatform;
  xpaths: string[];
  /** Parallel to `xpaths`; absent on cache entries written by older versions. */
  xpathSources?: XpathCandidateSource[];
  target: XpathCacheTarget;
};

export interface XpathCandidateOptions {
  /**
   * Natural-language target description used to verify semantic identities.
   * A text-like attribute is eligible only when its value appears here.
   */
  targetDescription?: string;
  /**
   * Model-located target rect in the same logical coordinate space as `bounds`.
   * When provided, only sufficiently overlapping tree nodes are considered.
   */
  expectedRect?: Rect;
  /**
   * Platform structural node types that must never become element cache
   * targets. These nodes may cover the located point and carry a unique name,
   * but their bounds describe an application/window container rather than the
   * unexposed control the model located.
   */
  excludedTargetTypes?: readonly string[];
  /**
   * Attribute names that count as "stable identifiers" when present. Searched
   * in priority order; the first safe value that uniquely identifies the node
   * is used to emit a top-priority `//*[@attr='value']` candidate. Examples per
   * platform:
   *   iOS    : ['accessibility-id', 'name']
   *   Android: ['resource-id']
   *   Harmony: ['inspectorKey']
   *   macOS  : ['AXIdentifier']
   *   Windows: ['AutomationId']
   *   Linux  : ['AccessibleId', 'id', 'automation-id']
   */
  stableAttrs?: string[];
  /**
   * Attribute names whose values describe the element semantically (label,
   * text, content). When no stable id is available, the generator emits a
   * `//Type[@attr='value']` candidate from the first safe, unique value that is
   * grounded in `targetDescription`.
   */
  textAttrs?: string[];
  /** Maximum number of candidates to return. Defaults to 3. */
  max?: number;
}
