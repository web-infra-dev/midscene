import type { UiNode, XpathCandidateOptions } from './types';
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
  hasAttributeSelector: boolean;
}

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
 * Walk the tree to find the deepest node whose bounds contain `point`. If
 * multiple sibling subtrees contain the point (overlapping layouts) the last
 * one in document order wins, mirroring the typical "topmost element" semantic.
 */
export function findNodeAtPoint(
  root: UiNode,
  point: PointXY,
): { node: UiNode; path: UiNode[] } | undefined {
  if (!pointInBounds(root, point)) return undefined;
  let best: { node: UiNode; path: UiNode[] } = { node: root, path: [root] };
  const visit = (node: UiNode, path: UiNode[]) => {
    for (const child of node.children) {
      if (!pointInBounds(child, point)) continue;
      const childPath = [...path, child];
      best = { node: child, path: childPath };
      visit(child, childPath);
    }
  };
  visit(root, [root]);
  return best;
}

function collectNodesAtPoint(root: UiNode, point: PointXY): PointHit[] {
  const hits: PointHit[] = [];
  if (!pointInBounds(root, point)) return hits;

  const visit = (node: UiNode, path: UiNode[]) => {
    hits.push({ node, path, order: hits.length });
    for (const child of node.children) {
      if (!pointInBounds(child, point)) continue;
      visit(child, [...path, child]);
    }
  };
  visit(root, [root]);
  return hits;
}

/**
 * 1-based positional index of `target` among siblings sharing the same `type`.
 * Mirrors W3C XPath `Tag[N]` semantics.
 */
function siblingIndex(parent: UiNode, target: UiNode): number {
  let idx = 0;
  for (const sibling of parent.children) {
    if (sibling.type === target.type) {
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
    if (i === 0) {
      xpath += `/${node.type}[1]`;
    } else {
      const parent = path[i - 1];
      xpath += `/${node.type}[${siblingIndex(parent, node)}]`;
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

function buildXpathCandidatesForHit(
  root: UiNode,
  hit: Pick<PointHit, 'node' | 'path'>,
  options: XpathCandidateOptions | undefined,
): XpathBuildResult {
  const max = options?.max ?? DEFAULT_MAX_CANDIDATES;
  const candidates: string[] = [];
  let hasAttributeSelector = false;
  const { node, path } = hit;

  const stable = pickFirstSafeAttr(node, options?.stableAttrs);
  if (stable) {
    const xpath = `//*[@${stable.attr}=${quoteAttr(stable.value)}]`;
    if (matchesUniquely(root, xpath, node)) {
      candidates.push(xpath);
      hasAttributeSelector = true;
    }
  }

  if (candidates.length < max) {
    const semantic = pickFirstSafeAttr(node, options?.textAttrs);
    if (semantic && node.type) {
      const xpath = `//${node.type}[@${semantic.attr}=${quoteAttr(semantic.value)}]`;
      if (!candidates.includes(xpath) && matchesUniquely(root, xpath, node)) {
        candidates.push(xpath);
        hasAttributeSelector = true;
      }
    }
  }

  if (candidates.length < max) {
    const positional = buildPositionalXpath(path);
    if (!candidates.includes(positional)) candidates.push(positional);
  }

  return {
    xpaths: candidates.slice(0, max),
    hasAttributeSelector,
  };
}

function nodeArea(node: UiNode): number {
  return Math.max(0, node.bounds.width) * Math.max(0, node.bounds.height);
}

function pickBestHitForCache(
  root: UiNode,
  hits: PointHit[],
  options: XpathCandidateOptions | undefined,
): XpathBuildResult | undefined {
  if (hits.length === 0) return undefined;

  const rootArea = Math.max(1, nodeArea(root));
  const evaluated = hits
    .map((hit) => ({
      hit,
      result: buildXpathCandidatesForHit(root, hit, options),
      area: nodeArea(hit.node),
    }))
    .filter(({ result }) => result.xpaths.length > 0);

  evaluated.sort((a, b) => {
    const aIsLarge = a.area / rootArea > 0.75;
    const bIsLarge = b.area / rootArea > 0.75;
    if (aIsLarge !== bIsLarge) return aIsLarge ? 1 : -1;

    if (a.result.hasAttributeSelector !== b.result.hasAttributeSelector) {
      return a.result.hasAttributeSelector ? -1 : 1;
    }

    if (a.area !== b.area) return a.area - b.area;

    const depthDelta = b.hit.path.length - a.hit.path.length;
    if (depthDelta !== 0) return depthDelta;

    return b.hit.order - a.hit.order;
  });

  return evaluated[0]?.result;
}

/**
 * Generate a small, ranked list of xpath candidates that locate the best cache
 * hit at `point` in `root`. The returned list is suitable for storage in
 * `cache.xpaths` and is consumed by xpath cache replay. Candidates are ordered
 * from most stable to most positional:
 *
 *   1) `//*[@<stableAttr>='value']`  — when the hit carries a stable id
 *   2) `//<Type>[@<textAttr>='value']` — when the hit carries a semantic label
 *   3) `/Root[1]/Child[i]/.../Target[k]` — always emitted as a last-resort
 *
 * Candidates that match more than one node in the current tree are dropped so
 * we never persist an ambiguous selector. The positional path is unique by
 * construction and never dropped.
 */
export function generateXpathCandidates(
  root: UiNode,
  point: PointXY,
  options?: XpathCandidateOptions,
): string[] {
  const hits = collectNodesAtPoint(root, point);
  return pickBestHitForCache(root, hits, options)?.xpaths ?? [];
}
