import { getDebug } from '@midscene/shared/logger';
import type {
  NativeXpathCachePlatform,
  UiNode,
  XpathCacheFeature,
  XpathCacheIdentity,
  XpathCacheTarget,
  XpathCacheTargetContext,
  XpathCandidateOptions,
  XpathCandidateSource,
} from './types';
import {
  NATIVE_XPATH_CACHE_KIND,
  NATIVE_XPATH_CACHE_SCHEMA_VERSION,
} from './types';
import { evaluateXpath } from './xpath-query';

const DEFAULT_MAX_CANDIDATES = 3;
const MAX_ATTR_VALUE_LENGTH = 256;

interface PointXY {
  x: number;
  y: number;
}

interface PointHit {
  node: UiNode;
  path: UiNode[];
  order: number;
}

interface XpathBuildResult {
  candidates: XpathCandidate[];
  target: XpathCacheTarget;
}

interface XpathCandidate {
  xpath: string;
  source: XpathCandidateSource;
}

interface RankedIdentity extends XpathCacheIdentity {
  kind: 'stable' | 'semantic';
}

const XPATH_TAG_RE = /^[A-Za-z_*][A-Za-z0-9_.\-:*]*$/;
const debugXpath = getDebug('cache:xpath');

function pointInBounds(node: UiNode, point: PointXY): boolean {
  const { left, top, width, height } = node.bounds;
  if (width <= 0 || height <= 0) return false;
  return (
    point.x >= left &&
    point.x < left + width &&
    point.y >= top &&
    point.y < top + height
  );
}

/**
 * Find the smallest node whose bounds contain `point`. Depth and document order
 * break ties, mirroring the typical deepest/topmost element semantic.
 */
export function findNodeAtPoint(
  root: UiNode,
  point: PointXY,
): { node: UiNode; path: UiNode[] } | undefined {
  const best = pickBestPointHit(collectNodesAtPoint(root, point));
  return best ? { node: best.node, path: best.path } : undefined;
}

function collectNodesAtPoint(root: UiNode, point: PointXY): PointHit[] {
  const hits: PointHit[] = [];

  const visit = (node: UiNode, path: UiNode[]) => {
    const containsPoint = pointInBounds(node, point);
    const hasBounds = node.bounds.width > 0 && node.bounds.height > 0;
    if (!containsPoint && hasBounds) return;

    if (containsPoint) {
      hits.push({ node, path, order: hits.length });
    }
    for (const child of node.children) {
      visit(child, [...path, child]);
    }
  };
  visit(root, [root]);
  return hits;
}

/**
 * Return a parser-safe tag, falling back to wildcard for native class names
 * such as Android inner classes that contain `$`.
 */
function xpathTag(type: string): string {
  return XPATH_TAG_RE.test(type) ? type : '*';
}

/** 1-based positional index among siblings matched by `tag`. */
function siblingIndex(parent: UiNode, target: UiNode, tag: string): number {
  let idx = 0;
  for (const sibling of parent.children) {
    if (tag === '*' || sibling.type === tag) {
      idx++;
      if (sibling === target) return idx;
    }
  }
  throw new Error(
    'siblingIndex: target is not a child of parent (path inconsistency)',
  );
}

function buildPositionalXpath(path: UiNode[]): string {
  let xpath = '';
  for (let i = 0; i < path.length; i++) {
    const node = path[i];
    const tag = xpathTag(node.type);
    if (i === 0) {
      xpath += `/${tag}[1]`;
    } else {
      const parent = path[i - 1];
      xpath += `/${tag}[${siblingIndex(parent, node, tag)}]`;
    }
  }
  return xpath;
}

function isAttrValueSafe(value: string | undefined): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_ATTR_VALUE_LENGTH) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    // XML 1.0 permits tab, LF, and CR but not the other C0 controls.
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      return false;
    }
  }
  return true;
}

/** Serialize a string as an exact XPath 1.0 literal. */
function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;

  const args: string[] = [];
  const parts = value.split("'");
  for (let index = 0; index < parts.length; index++) {
    args.push(`'${parts[index]}'`);
    if (index < parts.length - 1) args.push(`"'"`);
  }
  return `concat(${args.join(',')})`;
}

function pickFirstUniqueAttr(
  root: UiNode,
  node: UiNode,
  attrNames: readonly string[] | undefined,
  buildXpath: (identity: { attr: string; value: string }) => string,
): { identity: { attr: string; value: string }; xpath: string } | undefined {
  if (!attrNames) return undefined;
  for (const attr of attrNames) {
    const value = node.attrs?.[attr];
    if (isAttrValueSafe(value)) {
      const identity = { attr, value };
      const xpath = buildXpath(identity);
      if (matchesUniquely(root, xpath, node)) {
        return { identity, xpath };
      }
    }
  }
  return undefined;
}

/**
 * Returns true iff exactly one node in the tree matches `xpath` and that node
 * is `target`. Cheap uniqueness check used to drop ambiguous candidates before
 * we commit them to the cache file.
 */
function matchesUniquely(root: UiNode, xpath: string, target: UiNode): boolean {
  const matches = evaluateXpath(root, xpath);
  return matches.length === 1 && matches[0] === target;
}

function toCacheTarget(
  node: UiNode,
  identities: XpathCacheIdentity[],
  ancestor?: XpathCacheTargetContext,
): XpathCacheTarget {
  const [identity, ...additionalAttrs] = identities;
  return {
    type: node.type,
    attr: identity.attr,
    value: identity.value,
    ...(additionalAttrs.length > 0 ? { additionalAttrs } : {}),
    ...(ancestor ? { ancestor } : {}),
  };
}

function rankedIdentities(
  node: UiNode,
  options: XpathCandidateOptions | undefined,
): RankedIdentity[] {
  const identities: RankedIdentity[] = [];
  const seen = new Set<string>();
  const append = (
    names: readonly string[] | undefined,
    kind: RankedIdentity['kind'],
  ) => {
    for (const attr of names ?? []) {
      if (seen.has(attr)) continue;
      const value = node.attrs[attr];
      if (!isAttrValueSafe(value)) continue;
      identities.push({ attr, value, kind });
      seen.add(attr);
    }
  };
  append(options?.stableAttrs, 'stable');
  append(options?.textAttrs, 'semantic');
  return identities;
}

function exactNodeXpath(
  node: UiNode,
  identities: XpathCacheIdentity[],
): string {
  const predicates = identities
    .map(({ attr, value }) => `[@${attr}=${xpathLiteral(value)}]`)
    .join('');
  return `//${xpathTag(node.type)}${predicates}`;
}

function findCompoundIdentity(
  root: UiNode,
  node: UiNode,
  options: XpathCandidateOptions | undefined,
): { identities: XpathCacheIdentity[]; xpath: string } | undefined {
  const identities = rankedIdentities(node, options);
  for (let first = 0; first < identities.length; first++) {
    for (let second = first + 1; second < identities.length; second++) {
      const pair = [identities[first], identities[second]].map(
        ({ attr, value }) => ({ attr, value }),
      );
      const xpath = exactNodeXpath(node, pair);
      if (matchesUniquely(root, xpath, node)) {
        return { identities: pair, xpath };
      }
    }
  }
  return undefined;
}

function uniqueStableAncestorIdentity(
  root: UiNode,
  node: UiNode,
  options: XpathCandidateOptions | undefined,
): { identity: XpathCacheIdentity; xpath: string } | undefined {
  for (const attr of options?.stableAttrs ?? []) {
    const value = node.attrs[attr];
    if (!isAttrValueSafe(value)) continue;
    const xpath = `//*[@${attr}=${xpathLiteral(value)}]`;
    if (matchesUniquely(root, xpath, node)) {
      return { identity: { attr, value }, xpath };
    }
  }
  return undefined;
}

function findAncestorScopedIdentity(
  root: UiNode,
  hit: Pick<PointHit, 'node' | 'path'>,
  options: XpathCandidateOptions | undefined,
):
  | {
      childIdentity: XpathCacheIdentity;
      ancestor: XpathCacheTargetContext;
      xpath: string;
    }
  | undefined {
  const childIdentities = rankedIdentities(hit.node, options);
  if (childIdentities.length === 0) return undefined;

  // Skip path[0], the normalized application/window root. Nearest-first keeps
  // the contextual identity as small as possible without promoting the click.
  for (let index = hit.path.length - 2; index >= 1; index--) {
    const ancestorNode = hit.path[index];
    const stableAncestor = uniqueStableAncestorIdentity(
      root,
      ancestorNode,
      options,
    );
    if (!stableAncestor) continue;

    for (const childIdentity of childIdentities) {
      const childXpath = exactNodeXpath(hit.node, [childIdentity]).slice(2);
      const xpath = `${stableAncestor.xpath}//${childXpath}`;
      if (!matchesUniquely(root, xpath, hit.node)) continue;
      return {
        childIdentity,
        ancestor: {
          type: ancestorNode.type,
          attr: stableAncestor.identity.attr,
          value: stableAncestor.identity.value,
        },
        xpath,
      };
    }
  }
  return undefined;
}

function buildXpathCandidatesForHit(
  root: UiNode,
  hit: Pick<PointHit, 'node' | 'path'>,
  options: XpathCandidateOptions | undefined,
): XpathBuildResult | undefined {
  const max = options?.max ?? DEFAULT_MAX_CANDIDATES;
  const candidates: XpathCandidate[] = [];
  let target: XpathCacheTarget | undefined;
  const { node, path } = hit;

  // A native tree root represents an application/window hierarchy, not the
  // control located by the model. Platform-declared structural nodes have the
  // same problem when the actual inner control is absent from accessibility.
  if (path.length === 1 || options?.excludedTargetTypes?.includes(node.type)) {
    return undefined;
  }

  const stable = pickFirstUniqueAttr(
    root,
    node,
    options?.stableAttrs,
    ({ attr, value }) => `//*[@${attr}=${xpathLiteral(value)}]`,
  );
  if (stable) {
    candidates.push({ xpath: stable.xpath, source: 'stable-attribute' });
    target = toCacheTarget(node, [stable.identity]);
  }

  if (candidates.length < max) {
    const semantic = pickFirstUniqueAttr(
      root,
      node,
      options?.textAttrs,
      ({ attr, value }) =>
        `//${xpathTag(node.type)}[@${attr}=${xpathLiteral(value)}]`,
    );
    if (
      semantic &&
      !candidates.some((candidate) => candidate.xpath === semantic.xpath)
    ) {
      candidates.push({
        xpath: semantic.xpath,
        source: 'semantic-attribute',
      });
      target ??= toCacheTarget(node, [semantic.identity]);
    }
  }

  if (!target) {
    const compound = findCompoundIdentity(root, node, options);
    if (compound) {
      candidates.push({
        xpath: compound.xpath,
        source: 'compound-attributes',
      });
      target = toCacheTarget(node, compound.identities);
    }
  }

  if (!target) {
    const contextual = findAncestorScopedIdentity(root, hit, options);
    if (contextual) {
      candidates.push({
        xpath: contextual.xpath,
        source: 'ancestor-scoped',
      });
      target = toCacheTarget(
        node,
        [contextual.childIdentity],
        contextual.ancestor,
      );
    }
  }

  if (!target) return undefined;

  if (candidates.length < max) {
    const positional = buildPositionalXpath(path);
    if (!candidates.some((candidate) => candidate.xpath === positional)) {
      candidates.push({ xpath: positional, source: 'positional-fallback' });
    }
  }

  return {
    candidates: candidates.slice(0, max),
    target,
  };
}

function nodeArea(node: UiNode): number {
  return Math.max(0, node.bounds.width) * Math.max(0, node.bounds.height);
}

function pickBestPointHit(hits: PointHit[]): PointHit | undefined {
  if (hits.length === 0) return undefined;

  return [...hits].sort((a, b) => {
    const areaDelta = nodeArea(a.node) - nodeArea(b.node);
    if (areaDelta !== 0) return areaDelta;

    const depthDelta = b.path.length - a.path.length;
    if (depthDelta !== 0) return depthDelta;

    return b.order - a.order;
  })[0];
}

/**
 * Generate a small, ranked list of xpath candidates that locate the best cache
 * hit at `point` in `root`. The returned list is suitable for storage in
 * `cache.xpaths` and is consumed by xpath cache replay. Candidates are ordered
 * from most stable to most positional:
 *
 *   1) `//*[@<stableAttr>='value']`  — when the hit carries a stable id
 *   2) `//<Type>[@<textAttr>='value']` — when the hit carries a semantic label
 *   3) `//<Type>[@a='x'][@b='y']` — exact compound identity
 *   4) `//*[@parentId='p']//<Type>[@label='x']` — stable ancestor scope
 *   5) `/Root[1]/Child[i]/.../Target[k]` — identity-checked fallback
 *
 * Candidates that match more than one node in the current tree are dropped so
 * we never persist an ambiguous selector. Targets without a unique stable or
 * semantic identity are not cached because a positional path alone cannot
 * prove that it still points to the same element on replay.
 */
export function generateXpathCacheFeature(
  root: UiNode,
  point: PointXY,
  platform: NativeXpathCachePlatform,
  options?: XpathCandidateOptions,
): XpathCacheFeature | undefined {
  const hit = pickBestPointHit(collectNodesAtPoint(root, point));
  if (!hit) {
    debugXpath('generate miss reason=no-point-hit point=%o', point);
    return undefined;
  }

  const result = buildXpathCandidatesForHit(root, hit, options);
  if (!result || result.candidates.length === 0) {
    const reason =
      hit.path.length === 1 ||
      options?.excludedTargetTypes?.includes(hit.node.type)
        ? 'structural-target'
        : 'no-verifiable-identity';
    debugXpath(
      'generate miss reason=%s targetType=%s point=%o',
      reason,
      hit.node.type,
      point,
    );
    return undefined;
  }

  const xpaths = result.candidates.map((candidate) => candidate.xpath);
  const xpathSources = result.candidates.map((candidate) => candidate.source);
  debugXpath(
    'generate hit targetType=%s targetAttr=%s sources=%o candidates=%d',
    result.target.type,
    result.target.attr,
    xpathSources,
    xpaths.length,
  );

  return {
    kind: NATIVE_XPATH_CACHE_KIND,
    schemaVersion: NATIVE_XPATH_CACHE_SCHEMA_VERSION,
    platform,
    xpaths,
    xpathSources,
    target: result.target,
  };
}

export function generateXpathCandidates(
  root: UiNode,
  point: PointXY,
  options?: XpathCandidateOptions,
): string[] {
  const hit = pickBestPointHit(collectNodesAtPoint(root, point));
  if (!hit) return [];
  return (
    buildXpathCandidatesForHit(root, hit, options)?.candidates.map(
      (candidate) => candidate.xpath,
    ) ?? []
  );
}
