import type { Rect, UiNode } from '@/types';

const DEFAULT_MAX_CANDIDATES = 5;
const MAX_ATTR_VALUE_LENGTH = 256;
const XPATH_TAG_RE = /^[A-Za-z_*][A-Za-z0-9_.\-:*]*$/;

interface PointXY {
  x: number;
  y: number;
}

export interface InspectionXpathOptions {
  expectedRect?: Rect;
  excludedTargetTypes?: readonly string[];
  stableAttrs?: readonly string[];
  textAttrs?: readonly string[];
  max?: number;
}

interface PointHit {
  node: UiNode;
  path: UiNode[];
  order: number;
}

function pointInBounds(node: UiNode, point: PointXY): boolean {
  const { left, top, width, height } = node.bounds;
  return (
    width > 0 &&
    height > 0 &&
    point.x >= left &&
    point.x < left + width &&
    point.y >= top &&
    point.y < top + height
  );
}

function nodeArea(node: UiNode): number {
  return Math.max(0, node.bounds.width) * Math.max(0, node.bounds.height);
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

function findNodeAtPoint(
  root: UiNode,
  point: PointXY,
): { node: UiNode; path: UiNode[] } | undefined {
  const best = collectNodesAtPoint(root, point).sort((left, right) => {
    const areaDelta = nodeArea(left.node) - nodeArea(right.node);
    if (areaDelta !== 0) return areaDelta;
    const depthDelta = right.path.length - left.path.length;
    if (depthDelta !== 0) return depthDelta;
    return right.order - left.order;
  })[0];
  return best ? { node: best.node, path: best.path } : undefined;
}

function rectIntersectionOverUnion(node: UiNode, expectedRect: Rect): number {
  const left = Math.max(node.bounds.left, expectedRect.left);
  const top = Math.max(node.bounds.top, expectedRect.top);
  const right = Math.min(
    node.bounds.left + node.bounds.width,
    expectedRect.left + expectedRect.width,
  );
  const bottom = Math.min(
    node.bounds.top + node.bounds.height,
    expectedRect.top + expectedRect.height,
  );
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const nodeArea =
    Math.max(0, node.bounds.width) * Math.max(0, node.bounds.height);
  const expectedArea =
    Math.max(0, expectedRect.width) * Math.max(0, expectedRect.height);
  const union = nodeArea + expectedArea - intersection;
  return union > 0 ? intersection / union : 0;
}

function findNodeAtPointByExpectedRect(
  root: UiNode,
  point: PointXY,
  expectedRect: Rect,
): { node: UiNode; path: UiNode[] } | undefined {
  const hits: Array<{ node: UiNode; path: UiNode[]; overlap: number }> = [];
  const visit = (node: UiNode, path: UiNode[]) => {
    const containsPoint = pointInBounds(node, point);
    const hasBounds = node.bounds.width > 0 && node.bounds.height > 0;
    if (!containsPoint && hasBounds) return;
    if (containsPoint) {
      hits.push({
        node,
        path,
        overlap: rectIntersectionOverUnion(node, expectedRect),
      });
    }
    for (const child of node.children) visit(child, [...path, child]);
  };
  visit(root, [root]);

  const best = hits
    .filter(({ overlap }) => overlap > 0)
    .sort(
      (left, right) =>
        right.overlap - left.overlap || right.path.length - left.path.length,
    )[0];
  return best ? { node: best.node, path: best.path } : undefined;
}

interface Identity {
  attr: string;
  value: string;
}

function xpathTag(type: string): string {
  return XPATH_TAG_RE.test(type) ? type : '*';
}

function isAttrValueSafe(value: string | undefined): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_ATTR_VALUE_LENGTH) return false;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      return false;
    }
  }
  return true;
}

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

function exactNodeXpath(node: UiNode, identities: Identity[]): string {
  const predicates = identities
    .map(({ attr, value }) => `[@${attr}=${xpathLiteral(value)}]`)
    .join('');
  return `//${xpathTag(node.type)}${predicates}`;
}

function collectNodes(root: UiNode): UiNode[] {
  const nodes: UiNode[] = [];
  const visit = (node: UiNode) => {
    nodes.push(node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return nodes;
}

function matchesIdentities(node: UiNode, identities: Identity[]): boolean {
  return identities.every(({ attr, value }) => node.attrs[attr] === value);
}

function identitiesAreUnique(
  root: UiNode,
  target: UiNode,
  identities: Identity[],
  requireType: boolean,
): boolean {
  const matches = collectNodes(root).filter(
    (node) =>
      (!requireType || node.type === target.type) &&
      matchesIdentities(node, identities),
  );
  return matches.length === 1 && matches[0] === target;
}

function identityIsGloballyUnique(
  root: UiNode,
  target: UiNode,
  identity: Identity,
): boolean {
  return identitiesAreUnique(root, target, [identity], false);
}

function targetIdentities(
  node: UiNode,
  options: InspectionXpathOptions | undefined,
): Identity[] {
  const identities: Identity[] = [];
  const seen = new Set<string>();
  for (const attr of [
    ...(options?.stableAttrs ?? []),
    ...(options?.textAttrs ?? []),
  ]) {
    if (seen.has(attr)) continue;
    const value = node.attrs[attr];
    if (!isAttrValueSafe(value)) continue;
    identities.push({ attr, value });
    seen.add(attr);
  }
  return identities;
}

function nearestSemanticAncestorHit(
  hit: { node: UiNode; path: UiNode[] },
  options: InspectionXpathOptions | undefined,
): { node: UiNode; path: UiNode[] } {
  if (targetIdentities(hit.node, options).length > 0) return hit;

  for (let pathIndex = hit.path.length - 2; pathIndex >= 1; pathIndex--) {
    const ancestor = hit.path[pathIndex];
    if (options?.excludedTargetTypes?.includes(ancestor.type)) break;
    const hasSemanticIdentity = (options?.textAttrs ?? []).some((attr) =>
      isAttrValueSafe(ancestor.attrs[attr]),
    );
    if (hasSemanticIdentity) {
      return {
        node: ancestor,
        path: hit.path.slice(0, pathIndex + 1),
      };
    }
  }
  return hit;
}

export function findInspectionTargetAtPoint(
  root: UiNode,
  point: PointXY,
  options?: InspectionXpathOptions,
): { node: UiNode; path: UiNode[] } {
  const pointHit = options?.expectedRect
    ? (findNodeAtPointByExpectedRect(root, point, options.expectedRect) ??
      findNodeAtPoint(root, point))
    : findNodeAtPoint(root, point);
  if (!pointHit) {
    throw new Error(
      `findInspectionTargetAtPoint: no node found at point (${point.x}, ${point.y})`,
    );
  }
  if (
    pointHit.path.length === 1 ||
    options?.excludedTargetTypes?.includes(pointHit.node.type)
  ) {
    throw new Error(
      `findInspectionTargetAtPoint: target node is not exposed (目标节点未暴露); matched structural node ${pointHit.node.type}`,
    );
  }
  return nearestSemanticAncestorHit(pointHit, options);
}

function siblingIndex(parent: UiNode, target: UiNode, tag: string): number {
  let index = 0;
  for (const sibling of parent.children) {
    if (tag === '*' || sibling.type === tag) {
      index++;
      if (sibling === target) return index;
    }
  }
  throw new Error(
    'generateInspectionXpathCandidates: inconsistent UI tree path',
  );
}

function buildPositionalXpath(path: UiNode[]): string {
  return path
    .map((node, index) => {
      const tag = xpathTag(node.type);
      const position =
        index === 0 ? 1 : siblingIndex(path[index - 1], node, tag);
      return `/${tag}[${position}]`;
    })
    .join('');
}

function uniqueStableAncestorXpath(
  root: UiNode,
  path: UiNode[],
  target: UiNode,
  identities: Identity[],
  stableAttrs: readonly string[] | undefined,
): string | undefined {
  for (let pathIndex = path.length - 2; pathIndex >= 1; pathIndex--) {
    const ancestor = path[pathIndex];
    for (const attr of stableAttrs ?? []) {
      const value = ancestor.attrs[attr];
      if (!isAttrValueSafe(value)) continue;
      const ancestorXpath = `//*[@${attr}=${xpathLiteral(value)}]`;
      if (
        !identityIsGloballyUnique(root, ancestor, {
          attr,
          value,
        })
      ) {
        continue;
      }

      for (const identity of identities) {
        const childXpath = exactNodeXpath(target, [identity]).slice(2);
        const xpath = `${ancestorXpath}//${childXpath}`;
        if (identitiesAreUnique(ancestor, target, [identity], true)) {
          return xpath;
        }
      }
    }
  }
  return undefined;
}

/**
 * Generate ranked XPath candidates for inspecting a node in a saved UI tree.
 * Semantic and positional selectors are allowed because the result is
 * evaluated against the same historical snapshot.
 */
export function generateInspectionXpathCandidates(
  root: UiNode,
  point: PointXY,
  options?: InspectionXpathOptions,
): string[] {
  const hit = findInspectionTargetAtPoint(root, point, options);

  const configuredMax = options?.max ?? DEFAULT_MAX_CANDIDATES;
  const max =
    Number.isInteger(configuredMax) && configuredMax > 0
      ? configuredMax
      : DEFAULT_MAX_CANDIDATES;
  const candidates: string[] = [];
  const append = (xpath: string, uniquelyMatchesTarget: boolean) => {
    if (
      candidates.length < max &&
      !candidates.includes(xpath) &&
      uniquelyMatchesTarget
    ) {
      candidates.push(xpath);
    }
  };

  for (const attr of options?.stableAttrs ?? []) {
    const value = hit.node.attrs[attr];
    if (isAttrValueSafe(value)) {
      const identity = { attr, value };
      append(
        `//*[@${attr}=${xpathLiteral(value)}]`,
        identityIsGloballyUnique(root, hit.node, identity),
      );
    }
  }

  for (const attr of options?.textAttrs ?? []) {
    const value = hit.node.attrs[attr];
    const identity = isAttrValueSafe(value) ? { attr, value } : undefined;
    if (identity && identityIsGloballyUnique(root, hit.node, identity)) {
      append(exactNodeXpath(hit.node, [identity]), true);
    }
  }

  const identities = targetIdentities(hit.node, options);
  if (candidates.length === 0) {
    for (let first = 0; first < identities.length; first++) {
      for (let second = first + 1; second < identities.length; second++) {
        const pair = [identities[first], identities[second]];
        append(
          exactNodeXpath(hit.node, pair),
          identitiesAreUnique(root, hit.node, pair, true),
        );
      }
    }

    const ancestorScoped = uniqueStableAncestorXpath(
      root,
      hit.path,
      hit.node,
      identities,
      options?.stableAttrs,
    );
    if (ancestorScoped) append(ancestorScoped, true);
  }

  append(buildPositionalXpath(hit.path), true);
  return candidates;
}
