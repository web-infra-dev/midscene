import type { UIContext, UITreeSnapshot, UiNode } from '@midscene/core';

export interface UITreeDataNode {
  key: string;
  title: string;
  children?: UITreeDataNode[];
}

export interface UITreeViewModel {
  treeData: UITreeDataNode[];
  nodeByKey: Map<string, UiNode>;
  defaultExpandedKeys: string[];
  nodeCount: number;
}

export interface UITreeSearchResult {
  treeData: UITreeDataNode[];
  expandedKeys: string[];
  matchCount: number;
  query: string;
}

const UI_TREE_MIN_CANVAS_WIDTH = 640;
const UI_TREE_INDENT_WIDTH = 24;
const UI_TREE_ROW_PADDING = 72;

export function hasUITreeView(uiContext: UIContext | undefined): boolean {
  return Boolean(uiContext?.uiTree || uiContext?.uiTreeError);
}

function estimatedTextWidth(text: string): number {
  return Array.from(text).reduce(
    (width, character) => width + (character.charCodeAt(0) > 255 ? 14 : 8),
    0,
  );
}

export function estimateUITreeCanvasWidth(treeData: UITreeDataNode[]): number {
  let requiredWidth = 0;
  const visit = (nodes: UITreeDataNode[], depth: number) => {
    for (const node of nodes) {
      requiredWidth = Math.max(
        requiredWidth,
        depth * UI_TREE_INDENT_WIDTH +
          estimatedTextWidth(node.title) +
          UI_TREE_ROW_PADDING,
      );
      if (node.children) visit(node.children, depth + 1);
    }
  };
  visit(treeData, 0);
  return Math.max(UI_TREE_MIN_CANVAS_WIDTH, Math.ceil(requiredWidth));
}

export function formatUITreeNodeTitle(node: UiNode): string {
  const labels = [node.type];
  const resourceId = node.attrs['resource-id'];
  const semanticText = node.attrs['content-desc'] || node.attrs.text;
  if (resourceId) labels.push(`resource-id=${resourceId}`);
  if (semanticText) labels.push(semanticText);
  return labels.join(' · ');
}

export function countUITreeNodes(root: UiNode): number {
  let count = 0;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    count++;
    pending.push(...current.children);
  }
  return count;
}

export function buildUITreeViewModel(
  snapshot: UITreeSnapshot,
): UITreeViewModel {
  const nodeByKey = new Map<string, UiNode>();
  const buildNode = (node: UiNode, key: string): UITreeDataNode => {
    nodeByKey.set(key, node);
    return {
      key,
      title: formatUITreeNodeTitle(node),
      ...(node.children.length > 0
        ? {
            children: node.children.map((child, index) =>
              buildNode(child, `${key}-${index}`),
            ),
          }
        : {}),
    };
  };

  return {
    treeData: [buildNode(snapshot.root, '0')],
    nodeByKey,
    defaultExpandedKeys: ['0'],
    nodeCount: countUITreeNodes(snapshot.root),
  };
}

function nodeMatchesSearch(node: UiNode, tokens: string[]): boolean {
  const searchableText = [
    node.type,
    ...Object.entries(node.attrs).flatMap(([name, value]) => [
      name,
      value ?? '',
    ]),
  ]
    .join('\n')
    .toLowerCase();
  return tokens.every((token) => searchableText.includes(token));
}

export function searchUITreeViewModel(
  model: UITreeViewModel,
  searchText: string,
): UITreeSearchResult {
  const query = searchText.trim().toLowerCase();
  if (!query) {
    return {
      treeData: model.treeData,
      expandedKeys: model.defaultExpandedKeys,
      matchCount: model.nodeCount,
      query,
    };
  }

  const tokens = query.split(/\s+/);
  const expandedKeys = new Set<string>();
  let matchCount = 0;
  const filterNode = (dataNode: UITreeDataNode): UITreeDataNode | undefined => {
    const node = model.nodeByKey.get(dataNode.key);
    if (!node) {
      throw new Error(`UI tree node is missing for key ${dataNode.key}`);
    }

    const matches = nodeMatchesSearch(node, tokens);
    if (matches) matchCount++;
    const children = (dataNode.children ?? [])
      .map(filterNode)
      .filter((child): child is UITreeDataNode => Boolean(child));

    if (!matches && children.length === 0) return undefined;
    if (children.length > 0) expandedKeys.add(dataNode.key);
    return {
      key: dataNode.key,
      title: dataNode.title,
      ...(children.length > 0 ? { children } : {}),
    };
  };

  const treeData = model.treeData
    .map(filterNode)
    .filter((node): node is UITreeDataNode => Boolean(node));
  return {
    treeData,
    expandedKeys: [...expandedKeys].sort(
      (left, right) =>
        left.split('-').length - right.split('-').length ||
        left.localeCompare(right),
    ),
    matchCount,
    query,
  };
}

export function summarizeUITreeSnapshot(snapshot: UITreeSnapshot) {
  return {
    platform: snapshot.platform,
    capturedAt: snapshot.capturedAt,
    xpathPolicy: snapshot.xpathPolicy,
    root: {
      type: snapshot.root.type,
      bounds: snapshot.root.bounds,
      childCount: snapshot.root.children.length,
      nodeCount: countUITreeNodes(snapshot.root),
      note: '[UI tree root omitted from JSON View; open UI Tree instead]',
    },
  };
}
