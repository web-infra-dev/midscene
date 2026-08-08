import type { Rect, UITreeSnapshot, UiNode } from '@/types';

interface PointXY {
  x: number;
  y: number;
}

interface PointHit {
  node: UiNode;
  path: UiNode[];
  order: number;
}

function hasResourceId(node: UiNode): boolean {
  return Boolean(node.attrs['resource-id']?.trim());
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
  const expectedArea =
    Math.max(0, expectedRect.width) * Math.max(0, expectedRect.height);
  const union = nodeArea(node) + expectedArea - intersection;
  return union > 0 ? intersection / union : 0;
}

function findTargetPath(
  root: UiNode,
  point: PointXY,
  expectedRect?: Rect,
): UiNode[] {
  const hits = collectNodesAtPoint(root, point);
  const expectedRectHit = expectedRect
    ? hits
        .map((hit) => ({
          ...hit,
          overlap: rectIntersectionOverUnion(hit.node, expectedRect),
        }))
        .filter(({ overlap }) => overlap > 0)
        .sort(
          (left, right) =>
            right.overlap - left.overlap ||
            right.path.length - left.path.length,
        )[0]
    : undefined;
  const best =
    expectedRectHit ??
    hits.sort((left, right) => {
      const areaDelta = nodeArea(left.node) - nodeArea(right.node);
      if (areaDelta !== 0) return areaDelta;
      const depthDelta = right.path.length - left.path.length;
      if (depthDelta !== 0) return depthDelta;
      return right.order - left.order;
    })[0];

  if (!best) {
    throw new Error(`no node found at point (${point.x}, ${point.y})`);
  }
  return best.path;
}

function cloneAncestorChain(path: UiNode[], rootIndex: number): UiNode {
  let branch: UiNode = {
    ...path[path.length - 1],
    attrs: { ...path[path.length - 1].attrs },
    children: [],
  };

  for (let index = path.length - 2; index >= rootIndex; index--) {
    branch = {
      ...path[index],
      attrs: { ...path[index].attrs },
      children: [branch],
    };
  }

  return branch;
}

/**
 * Reduce a captured Android tree to the located target's direct ancestor chain.
 * The closest ancestor carrying a resource-id becomes the snapshot root; when
 * no such ancestor exists, the original tree root is retained. The located
 * target remains the only leaf, so reports keep its direct context without
 * serializing unrelated branches.
 */
export function pruneUITreeSnapshotToTarget(
  snapshot: UITreeSnapshot,
  point: PointXY,
  expectedRect?: Rect,
): UITreeSnapshot {
  const path = findTargetPath(snapshot.root, point, expectedRect);

  let rootIndex = 0;
  for (let index = path.length - 2; index >= 0; index--) {
    if (hasResourceId(path[index])) {
      rootIndex = index;
      break;
    }
  }

  return {
    ...snapshot,
    root: cloneAncestorChain(path, rootIndex),
  };
}
