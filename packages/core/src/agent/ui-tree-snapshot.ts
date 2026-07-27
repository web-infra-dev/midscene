import type {
  Rect,
  UITreeIdentityCount,
  UITreeSnapshot,
  UiNode,
} from '@/types';
import { findInspectionTargetAtPoint } from './inspection-xpath';

interface PointXY {
  x: number;
  y: number;
}

function hasResourceId(node: UiNode): boolean {
  return Boolean(node.attrs['resource-id']?.trim());
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

function identityKey(attr: string, value: string): string {
  return JSON.stringify([attr, value]);
}

function collectPageIdentityCounts(
  root: UiNode,
  retainedPath: UiNode[],
  attributes: string[],
): UITreeIdentityCount[] {
  const identities = new Map<string, UITreeIdentityCount>();
  const uniqueAttributes = [...new Set(attributes)];

  for (const node of retainedPath) {
    for (const attr of uniqueAttributes) {
      const value = node.attrs[attr];
      if (!value) continue;
      const key = identityKey(attr, value);
      if (!identities.has(key)) {
        identities.set(key, { attr, value, count: 0 });
      }
    }
  }

  const visit = (node: UiNode) => {
    for (const identity of identities.values()) {
      if (node.attrs[identity.attr] === identity.value) {
        identity.count++;
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return [...identities.values()];
}

/**
 * Reduce a captured Android tree to the located target's direct ancestor chain.
 * The closest ancestor carrying a resource-id becomes the snapshot root; when
 * no such ancestor exists, the original tree root is retained. The located
 * target remains the only leaf (even when it has its own resource-id), so the
 * report can display the located element and its direct context without
 * serializing unrelated branches.
 */
export function pruneUITreeSnapshotToTarget(
  snapshot: UITreeSnapshot,
  point: PointXY,
  expectedRect?: Rect,
): UITreeSnapshot {
  const hit = findInspectionTargetAtPoint(snapshot.root, point, {
    ...snapshot.xpathPolicy,
    expectedRect,
  });

  let rootIndex = 0;
  for (let index = hit.path.length - 2; index >= 0; index--) {
    if (hasResourceId(hit.path[index])) {
      rootIndex = index;
      break;
    }
  }

  return {
    ...snapshot,
    root: cloneAncestorChain(hit.path, rootIndex),
    inspection: {
      scope: 'target-lineage',
      pageIdentityCounts: collectPageIdentityCounts(
        snapshot.root,
        hit.path.slice(rootIndex),
        [
          ...snapshot.xpathPolicy.stableAttrs,
          ...snapshot.xpathPolicy.textAttrs,
        ],
      ),
    },
  };
}
