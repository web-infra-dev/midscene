import type {
  UiNode,
  XpathCacheFeature,
  XpathCacheTarget,
  XpathCandidateOptions,
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
  xpaths: string[];
  target: XpathCacheTarget;
}

const XPATH_TAG_RE = /^[A-Za-z_*][A-Za-z0-9_.\-:*]*$/;

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
    // Reject C0 control chars (incl. CR/LF/TAB) and DEL.
    if (code < 0x20 || code === 0x7f) return false;
    // Reject brackets — they would corrupt our predicate parser.
    if (code === 0x5b /* [ */ || code === 0x5d /* ] */) return false;
  }
  // Need at least one quote style available for safe wrapping.
  if (value.includes("'") && value.includes('"')) return false;
  return true;
}

function quoteAttr(value: string): string {
  return value.includes("'") ? `"${value}"` : `'${value}'`;
}

function pickFirstSafeAttr(
  node: UiNode,
  attrNames: string[] | undefined,
): { attr: string; value: string } | undefined {
  if (!attrNames) return undefined;
  for (const attr of attrNames) {
    const value = node.attrs?.[attr];
    if (isAttrValueSafe(value)) {
      return { attr, value };
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
  identity: { attr: string; value: string },
): XpathCacheTarget {
  return {
    type: node.type,
    attr: identity.attr,
    value: identity.value,
  };
}

function buildXpathCandidatesForHit(
  root: UiNode,
  hit: Pick<PointHit, 'node' | 'path'>,
  options: XpathCandidateOptions | undefined,
): XpathBuildResult | undefined {
  const max = options?.max ?? DEFAULT_MAX_CANDIDATES;
  const candidates: string[] = [];
  let target: XpathCacheTarget | undefined;
  const { node, path } = hit;

  const stable = pickFirstSafeAttr(node, options?.stableAttrs);
  if (stable) {
    const xpath = `//*[@${stable.attr}=${quoteAttr(stable.value)}]`;
    if (matchesUniquely(root, xpath, node)) {
      candidates.push(xpath);
      target = toCacheTarget(node, stable);
    }
  }

  if (candidates.length < max) {
    const semantic = pickFirstSafeAttr(node, options?.textAttrs);
    if (semantic && node.type) {
      const xpath = `//${xpathTag(node.type)}[@${semantic.attr}=${quoteAttr(semantic.value)}]`;
      if (!candidates.includes(xpath) && matchesUniquely(root, xpath, node)) {
        candidates.push(xpath);
        target ??= toCacheTarget(node, semantic);
      }
    }
  }

  if (!target) {
    return undefined;
  }

  if (candidates.length < max) {
    const positional = buildPositionalXpath(path);
    if (!candidates.includes(positional)) candidates.push(positional);
  }

  return {
    xpaths: candidates.slice(0, max),
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
 *   3) `/Root[1]/Child[i]/.../Target[k]` — identity-checked fallback
 *
 * Candidates that match more than one node in the current tree are dropped so
 * we never persist an ambiguous selector. Targets without a unique stable or
 * semantic identity are not cached because a positional path alone cannot
 * prove that it still points to the same element on replay.
 */
export function generateXpathCacheFeature(
  root: UiNode,
  point: PointXY,
  options?: XpathCandidateOptions,
): XpathCacheFeature | undefined {
  const hit = pickBestPointHit(collectNodesAtPoint(root, point));
  if (!hit) return undefined;

  const result = buildXpathCandidatesForHit(root, hit, options);
  if (!result || result.xpaths.length === 0) return undefined;

  return {
    xpaths: result.xpaths,
    target: result.target,
  };
}

export function generateXpathCandidates(
  root: UiNode,
  point: PointXY,
  options?: XpathCandidateOptions,
): string[] {
  return generateXpathCacheFeature(root, point, options)?.xpaths ?? [];
}
