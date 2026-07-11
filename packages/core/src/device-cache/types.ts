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

/** Identity that a replayed native xpath must still satisfy. */
export interface XpathCacheTarget {
  type: string;
  attr: string;
  value: string;
}

/** Native element cache payload written by the shared xpath cache pipeline. */
export type XpathCacheFeature = Record<string, unknown> & {
  xpaths: string[];
  target: XpathCacheTarget;
};

export interface XpathCandidateOptions {
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
   * `//Type[@attr='value']` candidate from the first safe, unique match.
   */
  textAttrs?: string[];
  /** Maximum number of candidates to return. Defaults to 3. */
  max?: number;
}
