import type { Rect } from '@midscene/shared/types';
import type { UiNode } from './types';

type Axis = 'child' | 'descendant';

type Predicate =
  | { kind: 'attr'; attr: string; value: string }
  | { kind: 'index'; index: number };

interface Step {
  axis: Axis;
  tag: string; // '*' for wildcard
  predicates: Predicate[];
}

const TAG_RE = /^([A-Za-z_*][A-Za-z0-9_.\-:*]*)/;
const ATTR_PRED_RE = /^@([A-Za-z_][A-Za-z0-9_\-:]*)=(['"])([\s\S]*?)\2$/;
const INDEX_PRED_RE = /^(\d+)$/;

function parseXpath(xpath: string): Step[] {
  const steps: Step[] = [];
  let i = 0;
  while (i < xpath.length) {
    let axis: Axis;
    if (xpath.startsWith('//', i)) {
      axis = 'descendant';
      i += 2;
    } else if (xpath.startsWith('/', i)) {
      axis = 'child';
      i += 1;
    } else {
      throw new Error(`Expected '/' or '//' at position ${i} in "${xpath}"`);
    }

    const tagMatch = TAG_RE.exec(xpath.slice(i));
    if (!tagMatch) {
      throw new Error(`Expected tag at position ${i} in "${xpath}"`);
    }
    const tag = tagMatch[1];
    i += tag.length;

    const predicates: Predicate[] = [];
    while (xpath[i] === '[') {
      const close = findPredicateEnd(xpath, i);
      const body = xpath.slice(i + 1, close).trim();
      const attrMatch = ATTR_PRED_RE.exec(body);
      const indexMatch = INDEX_PRED_RE.exec(body);
      if (attrMatch) {
        predicates.push({
          kind: 'attr',
          attr: attrMatch[1],
          value: attrMatch[3],
        });
      } else if (indexMatch) {
        predicates.push({
          kind: 'index',
          index: Number.parseInt(indexMatch[1], 10),
        });
      } else {
        throw new Error(`Unsupported predicate "[${body}]" in "${xpath}"`);
      }
      i = close + 1;
    }

    steps.push({ axis, tag, predicates });
  }
  return steps;
}

// Find the matching ']' for the '[' at startIdx, respecting nested quoted strings.
function findPredicateEnd(xpath: string, startIdx: number): number {
  let i = startIdx + 1;
  let quote: string | null = null;
  while (i < xpath.length) {
    const c = xpath[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === ']') {
      return i;
    }
    i++;
  }
  throw new Error(
    `Unclosed predicate starting at position ${startIdx} in "${xpath}"`,
  );
}

function collectDescendants(node: UiNode, out: UiNode[]): void {
  for (const child of node.children) {
    out.push(child);
    collectDescendants(child, out);
  }
}

function matchesNameAndAttrs(node: UiNode, step: Step): boolean {
  if (step.tag !== '*' && node.type !== step.tag) return false;
  for (const pred of step.predicates) {
    if (pred.kind !== 'attr') continue;
    if ((node.attrs?.[pred.attr] ?? '') !== pred.value) return false;
  }
  return true;
}

function applyIndexPredicate(nodes: UiNode[], step: Step): UiNode[] {
  let result = nodes;
  for (const pred of step.predicates) {
    if (pred.kind !== 'index') continue;
    if (pred.index < 1 || pred.index > result.length) return [];
    result = [result[pred.index - 1]];
  }
  return result;
}

function evaluateStep(context: UiNode[], step: Step): UiNode[] {
  const out: UiNode[] = [];
  for (const node of context) {
    let candidates: UiNode[];
    if (step.axis === 'child') {
      candidates = node.children;
    } else {
      candidates = [];
      collectDescendants(node, candidates);
    }
    const filtered = candidates.filter((n) => matchesNameAndAttrs(n, step));
    out.push(...applyIndexPredicate(filtered, step));
  }
  return out;
}

/**
 * Evaluate an xpath expression against a UiNode tree and return all matching
 * nodes. Walks the tree in a single pass per step, so cost is O(N) per step.
 *
 * Supported subset (intentionally small — the cache writer only emits these):
 *   - Axes:        `/Tag` (child) and `//Tag` (descendant-or-self)
 *   - Name tests:  exact tag match or `*` wildcard
 *   - Predicates:  `[@attr='value']`, `[@attr="value"]`, `[N]` (1-based)
 *
 * Anything outside this subset throws.
 */
export function evaluateXpath(root: UiNode, xpath: string): UiNode[] {
  const steps = parseXpath(xpath);
  if (steps.length === 0) return [];

  // The first step's axis is interpreted relative to the *virtual* parent of
  // root: `/Tag` matches the root iff its name matches, `//Tag` searches root
  // and all descendants.
  const first = steps[0];
  let context: UiNode[];
  if (first.axis === 'child') {
    const matched = matchesNameAndAttrs(root, first) ? [root] : [];
    context = applyIndexPredicate(matched, first);
  } else {
    const all: UiNode[] = [root];
    collectDescendants(root, all);
    const filtered = all.filter((n) => matchesNameAndAttrs(n, first));
    context = applyIndexPredicate(filtered, first);
  }

  for (let i = 1; i < steps.length; i++) {
    if (context.length === 0) return [];
    context = evaluateStep(context, steps[i]);
  }
  return context;
}

/**
 * Resolve the bounds of the first node matched by `xpath`. Returns `undefined`
 * if no node matches. The caller (rectMatchesCacheFeature) is responsible for
 * deciding whether absence is a soft miss or an error.
 */
export function findRectByXpath(root: UiNode, xpath: string): Rect | undefined {
  const matches = evaluateXpath(root, xpath);
  return matches[0]?.bounds;
}

export interface XpathCacheMatch {
  xpath: string;
  rect: Rect;
}

function getCacheFeatureXpaths(feature: unknown): string[] {
  const maybeXpaths = (feature as { xpaths?: unknown } | undefined)?.xpaths;
  return Array.isArray(maybeXpaths)
    ? maybeXpaths.filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      )
    : [];
}

/**
 * Resolve an xpath cache feature to a single, non-ambiguous rect. A cache entry
 * that currently matches multiple nodes is treated as stale instead of using
 * the first match, because repeated labels/resource ids in lists can otherwise
 * send actions to the wrong element while still reporting `hitBy: Cache`.
 */
export function matchRectByXpathCache(
  root: UiNode,
  feature: unknown,
): XpathCacheMatch {
  const xpaths = getCacheFeatureXpaths(feature);
  if (xpaths.length === 0) {
    throw new Error('matchRectByXpathCache: no xpath in cache feature');
  }

  const misses: string[] = [];
  for (const xpath of xpaths) {
    let matches: UiNode[];
    try {
      matches = evaluateXpath(root, xpath);
    } catch (error) {
      misses.push(`${xpath} failed: ${error}`);
      continue;
    }

    if (matches.length !== 1) {
      misses.push(`${xpath} matched ${matches.length} node(s)`);
      continue;
    }

    const rect = matches[0].bounds;
    if (rect.width > 0 && rect.height > 0) {
      return { xpath, rect };
    }
    misses.push(`${xpath} matched a zero-size node`);
  }

  throw new Error(
    `matchRectByXpathCache: no unique xpath matched (tried ${xpaths.length}; ${misses.join('; ')})`,
  );
}
