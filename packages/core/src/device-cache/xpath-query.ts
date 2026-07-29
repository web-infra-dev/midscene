import { getDebug } from '@midscene/shared/logger';
import type { Rect } from '@midscene/shared/types';
import type {
  NativeXpathCachePlatform,
  UiNode,
  XpathCacheIdentity,
  XpathCacheTarget,
  XpathCacheTargetContext,
  XpathCandidateSource,
} from './types';
import {
  EXPLICIT_XPATH_FEATURE_KIND,
  NATIVE_XPATH_CACHE_KIND,
  NATIVE_XPATH_CACHE_SCHEMA_VERSION,
} from './types';

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
const ATTR_PRED_RE = /^@([A-Za-z_][A-Za-z0-9_\-:]*)=([\s\S]+)$/;
const INDEX_PRED_RE = /^(\d+)$/;
const debugXpath = getDebug('cache:xpath');

function parseQuotedXpathLiteral(
  input: string,
  start: number,
): { value: string; next: number } {
  const quote = input[start];
  if (quote !== "'" && quote !== '"') {
    throw new Error(`Expected quoted XPath literal at position ${start}`);
  }
  const end = input.indexOf(quote, start + 1);
  if (end === -1) {
    throw new Error(`Unclosed XPath literal at position ${start}`);
  }
  return { value: input.slice(start + 1, end), next: end + 1 };
}

function parseConcatXpathLiteral(expression: string): string {
  if (!expression.startsWith('concat(') || !expression.endsWith(')')) {
    throw new Error(`Unsupported XPath literal expression "${expression}"`);
  }
  const input = expression.slice('concat('.length, -1);
  const values: string[] = [];
  let index = 0;
  while (index < input.length) {
    while (/\s/.test(input[index] ?? '')) index++;
    const parsed = parseQuotedXpathLiteral(input, index);
    values.push(parsed.value);
    index = parsed.next;
    while (/\s/.test(input[index] ?? '')) index++;
    if (index === input.length) break;
    if (input[index] !== ',') {
      throw new Error(`Expected ',' at position ${index} in "${expression}"`);
    }
    index++;
  }
  if (values.length < 2) {
    throw new Error('XPath concat() requires at least two literal arguments');
  }
  return values.join('');
}

function parseXpathLiteral(expression: string): string {
  const input = expression.trim();
  if (input.startsWith("'") || input.startsWith('"')) {
    const parsed = parseQuotedXpathLiteral(input, 0);
    if (parsed.next !== input.length) {
      throw new Error(`Unexpected text after XPath literal in "${expression}"`);
    }
    return parsed.value;
  }
  return parseConcatXpathLiteral(input);
}

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
          value: parseXpathLiteral(attrMatch[2]),
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
  source?: XpathCandidateSource;
}

function validateCacheFeatureScope(
  feature: unknown,
  expectedPlatform: NativeXpathCachePlatform,
): 'native' | 'explicit' {
  if (!feature || typeof feature !== 'object') {
    throw new Error('matchRectByXpathCache: invalid cache feature');
  }
  const record = feature as Record<string, unknown>;
  if (record.kind === EXPLICIT_XPATH_FEATURE_KIND) return 'explicit';
  if (record.kind !== NATIVE_XPATH_CACHE_KIND) {
    throw new Error('matchRectByXpathCache: cache feature is not native xpath');
  }
  if (record.schemaVersion !== NATIVE_XPATH_CACHE_SCHEMA_VERSION) {
    throw new Error(
      `matchRectByXpathCache: unsupported native xpath schema version ${String(record.schemaVersion)}`,
    );
  }
  if (record.platform !== expectedPlatform) {
    throw new Error(
      `matchRectByXpathCache: cache platform ${String(record.platform)} does not match ${expectedPlatform}`,
    );
  }
  return 'native';
}

function getCacheFeatureXpaths(feature: unknown): string[] {
  const maybeXpaths = (feature as { xpaths?: unknown } | undefined)?.xpaths;
  return Array.isArray(maybeXpaths)
    ? maybeXpaths.filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      )
    : [];
}

const XPATH_CANDIDATE_SOURCES = new Set<XpathCandidateSource>([
  'stable-attribute',
  'semantic-attribute',
  'compound-attributes',
  'ancestor-scoped',
  'positional-fallback',
]);

function getCacheFeatureXpathSources(feature: unknown): XpathCandidateSource[] {
  const value = (feature as { xpathSources?: unknown } | undefined)
    ?.xpathSources;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (source): source is XpathCandidateSource =>
      typeof source === 'string' &&
      XPATH_CANDIDATE_SOURCES.has(source as XpathCandidateSource),
  );
}

function parseCacheIdentity(value: unknown): XpathCacheIdentity | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { attr, value: identityValue } = value as Record<string, unknown>;
  if (
    typeof attr !== 'string' ||
    attr.length === 0 ||
    typeof identityValue !== 'string' ||
    identityValue.length === 0
  ) {
    return undefined;
  }
  return { attr, value: identityValue };
}

function parseTargetContext(
  value: unknown,
): XpathCacheTargetContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const identity = parseCacheIdentity(record);
  if (
    !identity ||
    typeof record.type !== 'string' ||
    record.type.length === 0
  ) {
    return undefined;
  }

  let additionalAttrs: XpathCacheIdentity[] | undefined;
  if (record.additionalAttrs !== undefined) {
    if (!Array.isArray(record.additionalAttrs)) return undefined;
    additionalAttrs = record.additionalAttrs
      .map(parseCacheIdentity)
      .filter((item): item is XpathCacheIdentity => item !== undefined);
    if (additionalAttrs.length !== record.additionalAttrs.length) {
      return undefined;
    }
    const attrs = new Set([identity.attr]);
    for (const additional of additionalAttrs) {
      if (attrs.has(additional.attr)) return undefined;
      attrs.add(additional.attr);
    }
  }

  return {
    type: record.type,
    ...identity,
    ...(additionalAttrs?.length ? { additionalAttrs } : {}),
  };
}

function getCacheFeatureTarget(feature: unknown): XpathCacheTarget | undefined {
  if (!feature || typeof feature !== 'object' || !('target' in feature)) {
    return undefined;
  }

  const rawTarget = (feature as { target: unknown }).target;
  const target = parseTargetContext(rawTarget);
  if (!target) {
    throw new Error('matchRectByXpathCache: invalid cache target');
  }

  const rawAncestor = (rawTarget as Record<string, unknown>).ancestor;
  if (rawAncestor === undefined) return target;
  const ancestor = parseTargetContext(rawAncestor);
  if (!ancestor) {
    throw new Error('matchRectByXpathCache: invalid cache target ancestor');
  }
  return { ...target, ancestor };
}

function matchesTargetContext(
  node: UiNode,
  target: XpathCacheTargetContext,
): boolean {
  if (node.type !== target.type || node.attrs[target.attr] !== target.value) {
    return false;
  }
  return (target.additionalAttrs ?? []).every(
    ({ attr, value }) => node.attrs[attr] === value,
  );
}

function collectTargetContextMatches(
  node: UiNode,
  target: XpathCacheTargetContext,
  matches: UiNode[],
): void {
  if (matchesTargetContext(node, target)) matches.push(node);
  for (const child of node.children) {
    collectTargetContextMatches(child, target, matches);
  }
}

function resolveExpectedTarget(root: UiNode, target: XpathCacheTarget): UiNode {
  let searchRoot = root;
  if (target.ancestor) {
    const ancestors: UiNode[] = [];
    collectTargetContextMatches(root, target.ancestor, ancestors);
    if (ancestors.length !== 1) {
      throw new Error(
        `matchRectByXpathCache: cache ancestor matched ${ancestors.length} node(s)`,
      );
    }
    searchRoot = ancestors[0];
  }

  const targetMatches: UiNode[] = [];
  if (!target.ancestor && matchesTargetContext(searchRoot, target)) {
    targetMatches.push(searchRoot);
  }
  for (const child of searchRoot.children) {
    collectTargetContextMatches(child, target, targetMatches);
  }
  if (targetMatches.length !== 1) {
    throw new Error(
      `matchRectByXpathCache: cache target matched ${targetMatches.length} node(s)`,
    );
  }
  return targetMatches[0];
}

/**
 * Resolve xpath candidates to a single, non-ambiguous rect. Native cache
 * entries include target metadata, which must still identify exactly one node
 * and agree with the resolved xpath. A feature marked as explicit xpath may
 * omit target metadata, but its xpath must still resolve uniquely.
 */
export function matchRectByXpathCache(
  root: UiNode,
  feature: unknown,
  expectedPlatform: NativeXpathCachePlatform,
): XpathCacheMatch {
  const scope = validateCacheFeatureScope(feature, expectedPlatform);
  const xpaths = getCacheFeatureXpaths(feature);
  const xpathSources = getCacheFeatureXpathSources(feature);
  const target = getCacheFeatureTarget(feature);
  if (xpaths.length === 0) {
    debugXpath('replay miss reason=no-xpath');
    throw new Error('matchRectByXpathCache: no xpath in cache feature');
  }

  if (scope === 'native' && !target) {
    throw new Error(
      'matchRectByXpathCache: native xpath cache target is missing',
    );
  }
  if (scope === 'explicit' && target) {
    throw new Error(
      'matchRectByXpathCache: explicit xpath must not carry a target',
    );
  }
  const expectedTarget = target
    ? resolveExpectedTarget(root, target)
    : undefined;

  const misses: string[] = [];
  for (let index = 0; index < xpaths.length; index++) {
    const xpath = xpaths[index];
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

    const match = matches[0];
    if (expectedTarget && match !== expectedTarget) {
      misses.push(`${xpath} matched a different target`);
      continue;
    }

    const rect = match.bounds;
    if (rect.width > 0 && rect.height > 0) {
      const source = xpathSources[index];
      debugXpath(
        'replay hit source=%s xpath=%s rect=%o',
        source ?? 'legacy-or-explicit',
        xpath,
        rect,
      );
      return source ? { xpath, rect, source } : { xpath, rect };
    }
    misses.push(`${xpath} matched a zero-size node`);
  }

  const message = `matchRectByXpathCache: no unique xpath matched (tried ${xpaths.length}; ${misses.join('; ')})`;
  debugXpath('replay miss reason=no-unique-xpath details=%s', message);
  throw new Error(message);
}
