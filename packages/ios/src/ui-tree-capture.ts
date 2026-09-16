import type { Rect, UITreeSnapshot, UiNode } from '@midscene/core';
import { getDebug } from '@midscene/shared/logger';
import type { IOSWebDriverClient, WdaSourceNode } from './ios-webdriver-client';

const debugUITree = getDebug('ios:ui-tree');

/** Coerce WDA's mixed boolean-ish flags ('1'/1/true) to a boolean. */
function wdaFlagOf(value: unknown): boolean | undefined {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return undefined;
}

/**
 * Default pruning depth. WDA's own `snapshotMaxDepth` is set to 50 during
 * session setup; pruning at 30 keeps the tree focused on actionable UI
 * while staying well under the WDA-side hard cap.
 */
export const AX_TREE_DEFAULT_MAX_DEPTH = 30;

export interface CaptureIOSUITreeOptions {
  /**
   * Pruning depth limit. Nodes at this depth keep their own attributes but
   * have their children dropped (truncation, not removal).
   * @default AX_TREE_DEFAULT_MAX_DEPTH
   */
  maxDepth?: number;
  /**
   * Keep invisible nodes (`isVisible === '0'`). When false (default),
   * invisible leaves are dropped, while invisible containers that still
   * have visible descendants are kept — iOS wraps plenty of interactive
   * elements in invisible `Other` containers.
   * @default false
   */
  includeInvisible?: boolean;
}

const ZERO_RECT: Rect = { left: 0, top: 0, width: 0, height: 0 };

function rectOf(node: WdaSourceNode): Rect {
  const rect = node.rect;
  if (
    rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height)
  ) {
    return {
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }
  return ZERO_RECT;
}

function attrsOf(node: WdaSourceNode): Record<string, string | undefined> {
  const attrs: Record<string, string | undefined> = {};
  // WDA emits whitespace-only label/name on container nodes; trim so the
  // attrs stay meaningful and the tree stays compact.
  const label = typeof node.label === 'string' ? node.label.trim() : '';
  if (label) {
    attrs.label = label;
  }
  const name = typeof node.name === 'string' ? node.name.trim() : '';
  if (name) {
    attrs.name = name;
  }
  if (node.value !== null && node.value !== undefined && node.value !== '') {
    attrs.value = String(node.value);
  }
  const enabled = wdaFlagOf(node.isEnabled);
  if (enabled !== undefined) {
    attrs.enabled = String(enabled);
  }
  const visible = wdaFlagOf(node.isVisible);
  if (visible !== undefined) {
    attrs.visible = String(visible);
  }
  if (typeof node.rawIdentifier === 'string' && node.rawIdentifier) {
    attrs.identifier = node.rawIdentifier;
  }
  return attrs;
}

/**
 * Convert a WDA source node into a Midscene {@link UiNode}, pruning
 * invisible/deep branches. Returns null for a node that should be dropped
 * (invisible leaf when `includeInvisible` is false). The root is always
 * kept.
 *
 * Note: WDA rects are in logical points (same coordinate system as
 * `getWindowSize`), so bounds are copied as-is — no DPR division, unlike
 * the Android uiautomator path.
 */
function pruneNode(
  node: WdaSourceNode,
  depth: number,
  options: Required<
    Pick<CaptureIOSUITreeOptions, 'maxDepth' | 'includeInvisible'>
  >,
): UiNode | null {
  const children: UiNode[] = [];
  if (depth < options.maxDepth) {
    for (const child of node.children ?? []) {
      const pruned = pruneNode(child, depth + 1, options);
      if (pruned) {
        children.push(pruned);
      }
    }
  }

  const isRoot = depth === 0;
  if (
    !isRoot &&
    !options.includeInvisible &&
    wdaFlagOf(node.isVisible) === false &&
    children.length === 0
  ) {
    // Invisible leaf (or an invisible container whose descendants were all
    // pruned): nothing actionable survives here.
    return null;
  }

  return {
    type: node.type,
    attrs: attrsOf(node),
    bounds: rectOf(node),
    children,
  };
}

/**
 * Pure conversion from a WDA `/source?format=json` tree to Midscene's
 * {@link UiNode}. Exported for unit testing and for benchmarking pruning
 * strategies against an already-fetched source.
 */
export function wdaSourceToUiNode(
  root: WdaSourceNode,
  options?: CaptureIOSUITreeOptions,
): UiNode {
  const resolved = {
    maxDepth: options?.maxDepth ?? AX_TREE_DEFAULT_MAX_DEPTH,
    includeInvisible: options?.includeInvisible ?? false,
  };
  const pruned = pruneNode(root, 0, resolved);
  // pruneNode only returns null for invisible non-root leaves; the root is
  // always kept. Guard anyway so the contract is non-nullable.
  return (
    pruned ?? {
      type: root.type,
      attrs: attrsOf(root),
      bounds: rectOf(root),
      children: [],
    }
  );
}

/** Count nodes in a UiNode tree. Benchmark/diagnostics helper. */
export function countUiNodes(root: UiNode): number {
  let count = 1;
  for (const child of root.children) {
    count += countUiNodes(child);
  }
  return count;
}

/** Count nodes in a raw WDA source tree. Benchmark/diagnostics helper. */
export function countWdaSourceNodes(root: WdaSourceNode): number {
  let count = 1;
  for (const child of root.children ?? []) {
    count += countWdaSourceNodes(child);
  }
  return count;
}

/**
 * Capture the current iOS accessibility tree via WDA `/source?format=json`
 * and prune it into a {@link UITreeSnapshot}.
 */
export async function captureIOSUITree(
  client: IOSWebDriverClient,
  options?: CaptureIOSUITreeOptions,
): Promise<UITreeSnapshot> {
  const startedAt = Date.now();
  const source = await client.getAccessibilitySource();
  const fetchedAt = Date.now();
  const root = wdaSourceToUiNode(source, options);
  const finishedAt = Date.now();

  debugUITree(
    'capture durationMs=%d fetchMs=%d trimMs=%d rawNodes=%d trimmedNodes=%d',
    finishedAt - startedAt,
    fetchedAt - startedAt,
    finishedAt - fetchedAt,
    countWdaSourceNodes(source),
    countUiNodes(root),
  );

  return {
    platform: 'ios',
    capturedAt: fetchedAt,
    root,
  };
}
