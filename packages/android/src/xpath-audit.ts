import type {
  UiNode,
  XpathCacheFeature,
  XpathCandidateSource,
} from '@midscene/core/internal/device-cache';
import {
  evaluateXpath,
  generateXpathCacheFeature,
  matchRectByXpathCache,
} from '@midscene/core/internal/device-cache';
import type { Rect, Size } from '@midscene/shared/types';
import { ANDROID_CACHE_CANDIDATE_OPTIONS } from './cache-policy';

export type AndroidAuditStatus =
  | 'cache-xpath-hit'
  | 'tree-only-positional'
  | 'exposed-no-safe-xpath'
  | 'not-exposed'
  | 'point-selected-other'
  | 'pending';

export type AndroidAuditRectSource = 'tree' | 'ai' | 'manual' | 'adjusted';

export type AndroidInteractionEvidenceSource =
  | 'accessibility-flag'
  | 'click-action'
  | 'web-role'
  | 'clickable-score'
  | 'target-url';

export interface AndroidAuditCandidateDiagnostic {
  matchCount: number;
  selectsNode: boolean;
  source?: XpathCandidateSource;
  xpath: string;
}

export interface AndroidAuditTreeNode {
  attrs: Record<string, string | undefined>;
  bounds: Rect;
  cacheFeature?: XpathCacheFeature;
  cacheFeatureXpaths: string[];
  cacheFeatureXpathSources: XpathCandidateSource[];
  cacheSelectedNodeId?: string;
  candidateDiagnostics: AndroidAuditCandidateDiagnostic[];
  childIndex: number;
  depth: number;
  failureReason?: string;
  interactive: boolean;
  interactionEvidence: AndroidInteractionEvidenceSource[];
  nodeId: string;
  parentNodeId: string | null;
  replayVerified: boolean;
  sourceUnique: boolean;
  structuralXpath: string;
  type: string;
  visible: boolean;
}

export interface AndroidAuditOverlay {
  description: string;
  name: string;
  nodeId: string | null;
  rect: Rect;
  rectSource: AndroidAuditRectSource;
  status: AndroidAuditStatus;
  statusReason?: string;
  visualElementId?: string;
}

export interface AndroidAuditVisualElementInput {
  description: string;
  id: string;
  name: string;
  rect: Rect;
  rectSource: Exclude<AndroidAuditRectSource, 'tree'>;
}

export interface AndroidAuditVisualElement
  extends AndroidAuditVisualElementInput {
  cacheFeature?: XpathCacheFeature;
  cacheFeatureXpaths: string[];
  cacheFeatureXpathSources: XpathCandidateSource[];
  candidateDiagnostics: AndroidAuditCandidateDiagnostic[];
  mappedNodeId: string | null;
  point: { x: number; y: number };
  productionSelectedNodeId?: string;
  sourceUnique: boolean;
  status: AndroidAuditStatus;
  statusReason?: string;
  structuralXpath?: string;
}

export interface AndroidVisualAudit {
  overlays: AndroidAuditOverlay[];
  visualElements: AndroidAuditVisualElement[];
}

export interface AndroidAuditReplaySummary {
  attempted: number;
  hits: number;
  misses: number;
  wrongMappings: number;
}

export interface AndroidLiveTreeAudit {
  overlays: AndroidAuditOverlay[];
  replay: AndroidAuditReplaySummary;
  treeNodes: AndroidAuditTreeNode[];
}

const ANDROID_SYSTEM_BAR_RESOURCE_IDS = new Set([
  'android:id/navigationBarBackground',
  'android:id/statusBarBackground',
]);
const MAX_VISUAL_MAPPING_NODE_AREA_RATIO = 12;
const MAX_SEMANTIC_CONTAINER_AREA_RATIO = 24;
const MAX_NEARBY_VISUAL_DISTANCE = 24;
const MAX_TREE_ID_AREA_RATIO = 0.25;
const MAX_TREE_DIRECT_AREA_RATIO = 0.25;
const MAX_TREE_TEXT_IMAGE_AREA_RATIO = 0.2;
const MAX_TREE_MULTI_TEXT_AREA_RATIO = 0.12;
const MAX_ADJACENT_IMAGE_SIZE = 20;
const CACHE_XPATH_HIT_REASON =
  'The cache XPath from the previous capture uniquely matched the same identity in the current tree';

interface EnumeratedNode {
  childIndex: number;
  depth: number;
  node: UiNode;
  nodeId: string;
  parent: UiNode | null;
  parentNodeId: string | null;
  structuralXpath: string;
}

interface EnumeratedTree {
  idByNode: Map<UiNode, string>;
  nodeById: Map<string, UiNode>;
  nodes: EnumeratedNode[];
}

function xpathTag(type: string): string {
  return /^[A-Za-z_*][A-Za-z0-9_.\-:*]*$/.test(type) ? type : '*';
}

export function enumerateAndroidUiTree(root: UiNode): EnumeratedTree {
  const nodes: EnumeratedNode[] = [];
  const nodeById = new Map<string, UiNode>();
  const idByNode = new Map<UiNode, string>();
  let sequence = 0;

  const visit = (
    node: UiNode,
    parent: UiNode | null,
    parentNodeId: string | null,
    depth: number,
    childIndex: number,
    parentXpath: string,
  ) => {
    sequence++;
    const nodeId = `node-${String(sequence).padStart(4, '0')}`;
    const tag = xpathTag(node.type);
    const siblings = parent?.children ?? [node];
    let typeSiblingIndex = 0;
    for (const sibling of siblings) {
      if (tag === '*' || sibling.type === node.type) typeSiblingIndex++;
      if (sibling === node) break;
    }
    const structuralXpath = `${parentXpath}/${tag}[${typeSiblingIndex}]`;
    nodes.push({
      childIndex,
      depth,
      node,
      nodeId,
      parent,
      parentNodeId,
      structuralXpath,
    });
    nodeById.set(nodeId, node);
    idByNode.set(node, nodeId);
    node.children.forEach((child, index) =>
      visit(child, node, nodeId, depth + 1, index, structuralXpath),
    );
  };

  visit(root, null, null, 0, 0, '');
  return { idByNode, nodeById, nodes };
}

function attrIsTrue(value: string | undefined): boolean {
  return value === 'true';
}

const INTERACTIVE_WEB_ROLES = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
  'treeitem',
]);

function firstAttr(node: UiNode, names: string[]): string | undefined {
  return names
    .map((name) => node.attrs[name]?.trim())
    .find((value): value is string => Boolean(value));
}

function hasClickAction(node: UiNode): boolean {
  const actions = firstAttr(node, [
    'actions',
    'action-list',
    'accessibility-actions',
  ]);
  if (!actions) return false;
  return actions
    .split(/[\s,|;]+/)
    .some((action) => /^(?:16|action[_-]?click|click)$/i.test(action));
}

function hasInteractiveWebRole(node: UiNode): boolean {
  const role = firstAttr(node, [
    'chrome-role',
    'chromeRole',
    'role',
    'role-description',
    'roleDescription',
  ]);
  if (!role) return false;
  const normalized = role.toLowerCase().replace(/[\s_-]+/g, '');
  return (
    INTERACTIVE_WEB_ROLES.has(normalized) ||
    /(?:按钮|链接|复选框|单选框|开关|输入框|选项卡)$/.test(role)
  );
}

function hasPositiveClickableScore(node: UiNode): boolean {
  const score = firstAttr(node, [
    'clickable-score',
    'clickableScore',
    'chrome-clickable-score',
  ]);
  if (!score) return false;
  const numericScore = Number(score);
  return Number.isFinite(numericScore) && numericScore > 0;
}

export function getAndroidInteractionEvidence(
  node: UiNode,
): AndroidInteractionEvidenceSource[] {
  const evidence: AndroidInteractionEvidenceSource[] = [];
  const hasAccessibilityFlag = [
    'clickable',
    'long-clickable',
    'focusable',
    'scrollable',
    'checkable',
    'editable',
  ].some((attr) => attrIsTrue(node.attrs[attr]));
  if (hasAccessibilityFlag) evidence.push('accessibility-flag');
  if (hasClickAction(node)) evidence.push('click-action');
  if (hasInteractiveWebRole(node)) evidence.push('web-role');
  if (hasPositiveClickableScore(node)) evidence.push('clickable-score');
  if (
    firstAttr(node, ['target-url', 'targetUrl', 'chrome-target-url', 'url'])
  ) {
    evidence.push('target-url');
  }
  return evidence;
}

function isVisible(rect: Rect, viewport: Rect): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left < viewport.width &&
    rect.top < viewport.height &&
    rect.left + rect.width > 0 &&
    rect.top + rect.height > 0
  );
}

function identityDescription(node: UiNode): string {
  return [
    node.attrs['resource-id'],
    node.attrs['content-desc'],
    node.attrs.text,
    node.type,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

function displayName(node: UiNode): string {
  const ownName = node.attrs.text || node.attrs['content-desc'];
  if (ownName) return ownName;

  const descendantNames: string[] = [];
  const collectNames = (current: UiNode): void => {
    for (const child of current.children) {
      const name = child.attrs.text || child.attrs['content-desc'];
      if (name && !descendantNames.includes(name)) {
        descendantNames.push(name);
      }
      if (descendantNames.length < 2) collectNames(child);
    }
  };
  collectNames(node);
  return (
    descendantNames.slice(0, 2).join(' · ') ||
    node.attrs['resource-id'] ||
    node.type
  );
}

function hasIdentity(node: UiNode): boolean {
  return ['resource-id', 'content-desc', 'text'].some((attr) =>
    Boolean(node.attrs[attr]),
  );
}

function pointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

function intersectionArea(a: Rect, b: Rect): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function rectArea(rect: Rect): number {
  return rect.width * rect.height;
}

function rectDistance(a: Rect, b: Rect): number {
  const horizontalGap = Math.max(
    0,
    Math.max(a.left, b.left) - Math.min(a.left + a.width, b.left + b.width),
  );
  const verticalGap = Math.max(
    0,
    Math.max(a.top, b.top) - Math.min(a.top + a.height, b.top + b.height),
  );
  return Math.hypot(horizontalGap, verticalGap);
}

function isAndroidSystemBar(node: AndroidAuditTreeNode): boolean {
  return ANDROID_SYSTEM_BAR_RESOURCE_IDS.has(node.attrs['resource-id'] ?? '');
}

function hasDirectInteractionSemantics(node: AndroidAuditTreeNode): boolean {
  return (
    node.type.endsWith('.Button') ||
    ['clickable', 'long-clickable', 'checkable', 'editable'].some((attr) =>
      attrIsTrue(node.attrs[attr]),
    ) ||
    node.interactionEvidence.some(
      (evidence) => evidence !== 'accessibility-flag',
    )
  );
}

function hasTreeText(node: AndroidAuditTreeNode): boolean {
  return Boolean(node.attrs.text || node.attrs['content-desc']);
}

function hasTreeResourceId(node: AndroidAuditTreeNode): boolean {
  return Boolean(node.attrs['resource-id']?.trim());
}

function isTreeImage(node: AndroidAuditTreeNode): boolean {
  return node.type.endsWith('.Image');
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.left + inner.width <= outer.left + outer.width &&
    inner.top + inner.height <= outer.top + outer.height
  );
}

interface TreeSubtreeStats {
  images: number;
  resourceIds: number;
  texts: number;
}

type TreeOverlayCandidateReason =
  | 'direct'
  | 'resource-id'
  | 'text-image'
  | 'multi-text'
  | 'adjacent-image'
  | 'image-cluster';

interface TreeOverlayCandidate {
  node: AndroidAuditTreeNode;
  priority: number;
  reason: TreeOverlayCandidateReason;
}

function selectTreeOverlayNodes(
  nodes: AndroidAuditTreeNode[],
  logicalSize: Size,
): AndroidAuditTreeNode[] {
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  const childrenById = new Map<string, AndroidAuditTreeNode[]>();
  for (const node of nodes) {
    if (!node.parentNodeId) continue;
    const siblings = childrenById.get(node.parentNodeId) ?? [];
    siblings.push(node);
    childrenById.set(node.parentNodeId, siblings);
  }

  const subtreeStats = new Map<string, TreeSubtreeStats>();
  const statsFor = (node: AndroidAuditTreeNode): TreeSubtreeStats => {
    const cached = subtreeStats.get(node.nodeId);
    if (cached) return cached;
    const stats = {
      images: isTreeImage(node) ? 1 : 0,
      resourceIds: hasTreeResourceId(node) ? 1 : 0,
      texts: hasTreeText(node) ? 1 : 0,
    };
    for (const child of childrenById.get(node.nodeId) ?? []) {
      const childStats = statsFor(child);
      stats.images += childStats.images;
      stats.resourceIds += childStats.resourceIds;
      stats.texts += childStats.texts;
    }
    subtreeStats.set(node.nodeId, stats);
    return stats;
  };

  const isInsideWebView = (node: AndroidAuditTreeNode): boolean => {
    let current: AndroidAuditTreeNode | undefined = node;
    while (current) {
      if (current.type.toLowerCase().includes('webview')) return true;
      current = current.parentNodeId
        ? nodeById.get(current.parentNodeId)
        : undefined;
    }
    return false;
  };

  const visibleImages = nodes.filter(
    (node) => node.visible && isTreeImage(node) && isInsideWebView(node),
  );
  const hasAdjacentSmallImage = (node: AndroidAuditTreeNode): boolean => {
    if (!hasTreeText(node)) return false;
    const right = node.bounds.left + node.bounds.width;
    return visibleImages.some((image) => {
      const horizontalGap = image.bounds.left - right;
      const verticalOverlap = Math.max(
        0,
        Math.min(
          node.bounds.top + node.bounds.height,
          image.bounds.top + image.bounds.height,
        ) - Math.max(node.bounds.top, image.bounds.top),
      );
      return (
        image.bounds.width <= MAX_ADJACENT_IMAGE_SIZE &&
        image.bounds.height <= MAX_ADJACENT_IMAGE_SIZE &&
        horizontalGap >= -10 &&
        horizontalGap <= MAX_NEARBY_VISUAL_DISTANCE &&
        verticalOverlap >=
          Math.min(node.bounds.height, image.bounds.height) * 0.3
      );
    });
  };

  const isImageClusterLeaf = (node: AndroidAuditTreeNode): boolean => {
    if (!isTreeImage(node) || !node.parentNodeId) return false;
    const parent = nodeById.get(node.parentNodeId);
    const grandparent = parent?.parentNodeId
      ? nodeById.get(parent.parentNodeId)
      : undefined;
    if (
      !parent ||
      !grandparent ||
      rectArea(parent.bounds) > rectArea(node.bounds) * 1.6
    ) {
      return false;
    }
    const imageOnlySiblings = (
      childrenById.get(grandparent.nodeId) ?? []
    ).filter((sibling) => {
      const stats = statsFor(sibling);
      return (
        stats.images > 0 &&
        stats.texts === 0 &&
        rectArea(sibling.bounds) <= rectArea(node.bounds) * 2
      );
    });
    return imageOnlySiblings.length >= 2;
  };

  const viewportArea = logicalSize.width * logicalSize.height;
  const candidates: TreeOverlayCandidate[] = [];
  for (const node of nodes) {
    if (!node.visible || isAndroidSystemBar(node)) continue;
    const insideWebView = isInsideWebView(node);
    const areaRatio = rectArea(node.bounds) / viewportArea;
    const weakWebViewTextInteraction =
      insideWebView &&
      node.type.endsWith('.TextView') &&
      node.interactionEvidence.length > 0 &&
      node.interactionEvidence.every(
        (evidence) => evidence === 'accessibility-flag',
      );
    if (
      hasDirectInteractionSemantics(node) &&
      !weakWebViewTextInteraction &&
      (node.type.endsWith('.Button') || areaRatio <= MAX_TREE_DIRECT_AREA_RATIO)
    ) {
      candidates.push({ node, priority: 5, reason: 'direct' });
      continue;
    }
    if (!insideWebView) continue;

    const stats = statsFor(node);
    const isContainer = !node.type.endsWith('.TextView') && !isTreeImage(node);
    if (
      hasTreeResourceId(node) &&
      areaRatio <= MAX_TREE_ID_AREA_RATIO &&
      !node.attrs['resource-id']?.startsWith('android:id/')
    ) {
      candidates.push({ node, priority: 4, reason: 'resource-id' });
    } else if (
      isContainer &&
      node.bounds.width >= 24 &&
      node.bounds.height >= 12 &&
      areaRatio <= MAX_TREE_TEXT_IMAGE_AREA_RATIO &&
      stats.texts >= 1 &&
      stats.images >= 1
    ) {
      candidates.push({ node, priority: 3, reason: 'text-image' });
    } else if (
      isContainer &&
      node.bounds.width >= 24 &&
      node.bounds.height >= 12 &&
      areaRatio <= MAX_TREE_MULTI_TEXT_AREA_RATIO &&
      stats.texts >= 2 &&
      (childrenById.get(node.nodeId)?.length ?? 0) >= 2
    ) {
      candidates.push({ node, priority: 2, reason: 'multi-text' });
    } else if (hasAdjacentSmallImage(node)) {
      candidates.push({ node, priority: 2, reason: 'adjacent-image' });
    } else if (isImageClusterLeaf(node)) {
      candidates.push({ node, priority: 2, reason: 'image-cluster' });
    }
  }

  const candidateById = new Map(
    candidates.map((candidate) => [candidate.node.nodeId, candidate]),
  );
  const candidateChildren = new Map<string, TreeOverlayCandidate[]>();
  const roots: TreeOverlayCandidate[] = [];

  for (const candidate of candidates) {
    let parentNodeId = candidate.node.parentNodeId;
    while (parentNodeId && !candidateById.has(parentNodeId)) {
      parentNodeId = nodeById.get(parentNodeId)?.parentNodeId ?? null;
    }
    if (!parentNodeId) {
      roots.push(candidate);
      continue;
    }
    const siblings = candidateChildren.get(parentNodeId) ?? [];
    siblings.push(candidate);
    candidateChildren.set(parentNodeId, siblings);
  }

  const selectGroup = (
    candidate: TreeOverlayCandidate,
  ): TreeOverlayCandidate[] => {
    const children = candidateChildren.get(candidate.node.nodeId) ?? [];
    if (children.length === 0) return [candidate];
    const stats = statsFor(candidate.node);
    const areaRatio = rectArea(candidate.node.bounds) / viewportArea;
    const isSemanticContainer =
      ['direct', 'text-image', 'multi-text'].includes(candidate.reason) &&
      !candidate.node.type.endsWith('.TextView') &&
      !isTreeImage(candidate.node) &&
      areaRatio <= MAX_TREE_TEXT_IMAGE_AREA_RATIO &&
      (stats.texts >= 2 || (stats.texts >= 1 && stats.images >= 1));
    if (
      isSemanticContainer &&
      (candidate.reason === 'direct' || children.length === 1)
    ) {
      return [candidate];
    }
    if (children.length === 1) {
      const child = children[0];
      const grandchildCount =
        candidateChildren.get(child.node.nodeId)?.length ?? 0;
      if (
        candidate.reason === 'resource-id' &&
        child.reason === 'resource-id' &&
        grandchildCount >= 2
      ) {
        return selectGroup(child);
      }
      const nodeArea = rectArea(candidate.node.bounds);
      const childArea = rectArea(child.node.bounds);
      if (
        childArea > 0 &&
        nodeArea <= childArea * MAX_SEMANTIC_CONTAINER_AREA_RATIO &&
        rectContains(candidate.node.bounds, child.node.bounds) &&
        candidate.priority >= child.priority
      ) {
        return [candidate];
      }
    }
    if (candidate.reason === 'resource-id') {
      const resourceIdBranches = children.filter(
        (child) => child.reason === 'resource-id',
      ).length;
      const actionBranches = children.filter(
        (child) =>
          child.reason === 'direct' || child.reason === 'image-cluster',
      ).length;
      if (resourceIdBranches < 2 && actionBranches < 2) {
        return [candidate];
      }
    }
    return children.flatMap(selectGroup);
  };

  return roots.flatMap(selectGroup).map((candidate) => candidate.node);
}

function visualGeometryScore(
  visualRect: Rect,
  point: { x: number; y: number },
  node: AndroidAuditTreeNode,
): number {
  const visualArea = rectArea(visualRect);
  const nodeArea = rectArea(node.bounds);
  if (
    visualArea <= 0 ||
    nodeArea <= 0 ||
    nodeArea > visualArea * MAX_SEMANTIC_CONTAINER_AREA_RATIO
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  const distance = rectDistance(visualRect, node.bounds);
  if (
    intersectionArea(visualRect, node.bounds) <= 0 &&
    distance > MAX_NEARBY_VISUAL_DISTANCE
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  const overlap = intersectionArea(visualRect, node.bounds);
  const overlapRatio = overlap / Math.max(1, Math.min(visualArea, nodeArea));
  const areaSimilarity =
    Math.min(visualArea, nodeArea) / Math.max(visualArea, nodeArea);
  const axisSimilarity =
    (Math.min(visualRect.width, node.bounds.width) /
      Math.max(visualRect.width, node.bounds.width) +
      Math.min(visualRect.height, node.bounds.height) /
        Math.max(visualRect.height, node.bounds.height)) /
    2;
  return (
    overlapRatio * 100 +
    areaSimilarity * 120 +
    axisSimilarity * 80 +
    (pointInRect(point, node.bounds) ? 20 : 0) -
    distance * 4 +
    node.depth * 0.01
  );
}

function visualMappingScore(
  visualRect: Rect,
  point: { x: number; y: number },
  node: AndroidAuditTreeNode,
): number {
  const overlap = intersectionArea(visualRect, node.bounds);
  if (overlap <= 0) return Number.NEGATIVE_INFINITY;
  const visualArea = visualRect.width * visualRect.height;
  const nodeArea = node.bounds.width * node.bounds.height;
  const overlapRatio = overlap / Math.max(1, Math.min(visualArea, nodeArea));
  const containsCenter = pointInRect(point, node.bounds);
  const identityScore = node.attrs['resource-id']
    ? 200
    : node.attrs['content-desc'] || node.attrs.text
      ? 100
      : 0;
  if (!containsCenter && overlapRatio < 0.35) {
    return Number.NEGATIVE_INFINITY;
  }
  if (nodeArea > visualArea * MAX_VISUAL_MAPPING_NODE_AREA_RATIO) {
    return Number.NEGATIVE_INFINITY;
  }
  const areaSimilarity =
    Math.min(visualArea, nodeArea) / Math.max(visualArea, nodeArea);
  const axisSimilarity =
    (Math.min(visualRect.width, node.bounds.width) /
      Math.max(visualRect.width, node.bounds.width) +
      Math.min(visualRect.height, node.bounds.height) /
        Math.max(visualRect.height, node.bounds.height)) /
    2;
  return (
    overlapRatio * 100 +
    areaSimilarity * 120 +
    axisSimilarity * 80 +
    (containsCenter ? 20 : 0) +
    identityScore +
    node.depth * 0.01
  );
}

function normalizeSemanticText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function semanticMatchScore(query: string, node: AndroidAuditTreeNode): number {
  return [node.attrs.text, node.attrs['content-desc']].reduce((best, value) => {
    if (!value) return best;
    const normalized = normalizeSemanticText(value);
    if (normalized.length < 2) return best;
    if (query.includes(normalized)) {
      return Math.max(best, normalized.length);
    }
    if (normalized.includes(query) && query.length >= 2) {
      return Math.max(best, query.length);
    }
    return best;
  }, 0);
}

function lowestCommonAncestor(
  first: AndroidAuditTreeNode,
  second: AndroidAuditTreeNode,
  nodeById: Map<string, AndroidAuditTreeNode>,
): AndroidAuditTreeNode | undefined {
  const firstAncestorIds = new Set<string>();
  let current: AndroidAuditTreeNode | undefined = first;
  while (current) {
    firstAncestorIds.add(current.nodeId);
    current = current.parentNodeId
      ? nodeById.get(current.parentNodeId)
      : undefined;
  }

  current = second;
  while (current) {
    if (firstAncestorIds.has(current.nodeId)) return current;
    current = current.parentNodeId
      ? nodeById.get(current.parentNodeId)
      : undefined;
  }
  return undefined;
}

function isDescendantOf(
  node: AndroidAuditTreeNode,
  ancestorNodeId: string,
  nodeById: Map<string, AndroidAuditTreeNode>,
): boolean {
  let parentNodeId = node.parentNodeId;
  while (parentNodeId) {
    if (parentNodeId === ancestorNodeId) return true;
    parentNodeId = nodeById.get(parentNodeId)?.parentNodeId ?? null;
  }
  return false;
}

function containsSeparateInteractiveControl(
  container: AndroidAuditTreeNode,
  visualRect: Rect,
  candidates: AndroidAuditTreeNode[],
  nodeById: Map<string, AndroidAuditTreeNode>,
): boolean {
  return candidates.some(
    (node) =>
      node.nodeId !== container.nodeId &&
      (node.interactive || node.type.endsWith('.Button')) &&
      isDescendantOf(node, container.nodeId, nodeById) &&
      intersectionArea(node.bounds, visualRect) <= 0,
  );
}

function semanticContainerForVisual(
  input: AndroidAuditVisualElementInput,
  point: { x: number; y: number },
  candidates: AndroidAuditTreeNode[],
  nodeById: Map<string, AndroidAuditTreeNode>,
): AndroidAuditTreeNode | undefined {
  const query = normalizeSemanticText(`${input.name} ${input.description}`);
  const semanticAnchor = candidates
    .map((node) => ({
      distance: rectDistance(input.rect, node.bounds),
      node,
      score: semanticMatchScore(query, node),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.distance - b.distance ||
        b.node.depth - a.node.depth,
    )[0]?.node;
  if (!semanticAnchor) return undefined;

  const spatialAnchor = candidates
    .map((node) => ({
      node,
      score: visualGeometryScore(input.rect, point, node),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((a, b) => b.score - a.score || b.node.depth - a.node.depth)[0]?.node;
  if (!spatialAnchor) return undefined;

  const container = lowestCommonAncestor(
    semanticAnchor,
    spatialAnchor,
    nodeById,
  );
  if (!container || isAndroidSystemBar(container)) return undefined;
  const visualArea = rectArea(input.rect);
  if (
    !container.visible ||
    rectArea(container.bounds) >
      visualArea * MAX_SEMANTIC_CONTAINER_AREA_RATIO ||
    containsSeparateInteractiveControl(
      container,
      input.rect,
      candidates,
      nodeById,
    )
  ) {
    return undefined;
  }
  return container;
}

function validateVisualInput(input: AndroidAuditVisualElementInput): void {
  if (!input.id.trim() || !input.name.trim() || !input.description.trim()) {
    throw new Error('Visual audit elements require id, name, and description');
  }
  if (
    !Number.isFinite(input.rect.left) ||
    !Number.isFinite(input.rect.top) ||
    !Number.isFinite(input.rect.width) ||
    !Number.isFinite(input.rect.height) ||
    input.rect.width <= 0 ||
    input.rect.height <= 0
  ) {
    throw new Error(`Visual audit element ${input.id} has an invalid rect`);
  }
}

function featureDiagnostics(
  root: UiNode,
  feature: XpathCacheFeature,
  expectedNode: UiNode,
): AndroidAuditCandidateDiagnostic[] {
  return feature.xpaths.map((xpath, index) => {
    try {
      const matches = evaluateXpath(root, xpath);
      return {
        xpath,
        source: feature.xpathSources?.[index],
        matchCount: matches.length,
        selectsNode: matches.length === 1 && matches[0] === expectedNode,
      };
    } catch {
      return {
        xpath,
        source: feature.xpathSources?.[index],
        matchCount: 0,
        selectsNode: false,
      };
    }
  });
}

export function buildAndroidAuditTree(
  root: UiNode,
  logicalSize: Size,
): AndroidAuditTreeNode[] {
  const enumerated = enumerateAndroidUiTree(root);
  const viewport = {
    left: 0,
    top: 0,
    width: logicalSize.width,
    height: logicalSize.height,
  };

  return enumerated.nodes.map((entry) => {
    const point = {
      x: entry.node.bounds.left + entry.node.bounds.width / 2,
      y: entry.node.bounds.top + entry.node.bounds.height / 2,
    };
    const feature = generateXpathCacheFeature(root, point, 'android', {
      ...ANDROID_CACHE_CANDIDATE_OPTIONS,
      targetDescription: identityDescription(entry.node),
      expectedRect: entry.node.bounds,
    });
    let cacheSelectedNodeId: string | undefined;
    let failureReason: string | undefined;
    if (feature) {
      try {
        const match = matchRectByXpathCache(root, feature, 'android');
        const matches = evaluateXpath(root, match.xpath);
        cacheSelectedNodeId =
          matches.length === 1
            ? enumerated.idByNode.get(matches[0])
            : undefined;
        if (matches.length !== 1) {
          failureReason = `${match.xpath} matched ${matches.length} nodes`;
        }
      } catch (error) {
        failureReason = error instanceof Error ? error.message : String(error);
      }
    }
    const candidateDiagnostics = feature
      ? featureDiagnostics(root, feature, entry.node)
      : [];
    const sourceUnique =
      cacheSelectedNodeId === entry.nodeId &&
      candidateDiagnostics.length > 0 &&
      candidateDiagnostics.every(
        (candidate) => candidate.matchCount === 1 && candidate.selectsNode,
      );

    const interactionEvidence = getAndroidInteractionEvidence(entry.node);
    return {
      attrs: entry.node.attrs,
      bounds: entry.node.bounds,
      cacheFeature: feature,
      cacheFeatureXpaths: feature?.xpaths ?? [],
      cacheFeatureXpathSources: feature?.xpathSources ?? [],
      cacheSelectedNodeId,
      candidateDiagnostics,
      childIndex: entry.childIndex,
      depth: entry.depth,
      failureReason,
      interactive: interactionEvidence.length > 0,
      interactionEvidence,
      nodeId: entry.nodeId,
      parentNodeId: entry.parentNodeId,
      replayVerified: false,
      sourceUnique,
      structuralXpath: entry.structuralXpath,
      type: entry.node.type,
      visible: isVisible(entry.node.bounds, viewport),
    };
  });
}

function unresolvedStatus(record: AndroidAuditTreeNode): {
  reason?: string;
  status: AndroidAuditStatus;
} {
  if (
    record.cacheSelectedNodeId &&
    record.cacheSelectedNodeId !== record.nodeId
  ) {
    return {
      status: 'point-selected-other',
      reason: `Production point selection chose ${record.cacheSelectedNodeId}`,
    };
  }
  if (
    !record.cacheFeature &&
    !hasIdentity({
      attrs: record.attrs,
      bounds: record.bounds,
      children: [],
      type: record.type,
    })
  ) {
    return {
      status: 'tree-only-positional',
      reason:
        'The node has no resource-id, content-desc, or text and only has a structural XPath',
    };
  }
  if (record.cacheFeature && record.sourceUnique) {
    return {
      status: 'pending',
      reason: 'Waiting for the next tree to validate the cache XPath',
    };
  }
  return {
    status: 'exposed-no-safe-xpath',
    reason:
      record.failureReason ??
      'The production generator did not produce a cache XPath that is safe to replay',
  };
}

export function buildAndroidLiveTreeAudit(
  currentRoot: UiNode,
  logicalSize: Size,
  previousTreeNodes: AndroidAuditTreeNode[] = [],
): AndroidLiveTreeAudit {
  const currentEnumerated = enumerateAndroidUiTree(currentRoot);
  const currentTreeNodes = buildAndroidAuditTree(currentRoot, logicalSize);
  const verifiedNodeIds = new Set<string>();
  const replay: AndroidAuditReplaySummary = {
    attempted: 0,
    hits: 0,
    misses: 0,
    wrongMappings: 0,
  };

  for (const previous of previousTreeNodes) {
    if (!previous.cacheFeature || !previous.sourceUnique) continue;
    replay.attempted++;
    try {
      const match = matchRectByXpathCache(
        currentRoot,
        previous.cacheFeature,
        'android',
      );
      const matches = evaluateXpath(currentRoot, match.xpath);
      const nodeId =
        matches.length === 1
          ? currentEnumerated.idByNode.get(matches[0])
          : undefined;
      if (nodeId) {
        verifiedNodeIds.add(nodeId);
        replay.hits++;
      } else {
        replay.misses++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('different target')) replay.wrongMappings++;
      else replay.misses++;
    }
  }

  const replayedTreeNodes = currentTreeNodes.map((record) =>
    verifiedNodeIds.has(record.nodeId)
      ? { ...record, replayVerified: true }
      : record,
  );
  const overlays = selectTreeOverlayNodes(replayedTreeNodes, logicalSize).map(
    (record): AndroidAuditOverlay => {
      const node = currentEnumerated.nodeById.get(record.nodeId);
      if (!node) {
        throw new Error(`Unable to resolve current tree node ${record.nodeId}`);
      }
      const unresolved = unresolvedStatus(record);
      const verified = record.replayVerified;
      return {
        description: identityDescription(node),
        name: displayName(node),
        nodeId: record.nodeId,
        rect: record.bounds,
        rectSource: 'tree',
        status: verified ? 'cache-xpath-hit' : unresolved.status,
        statusReason: verified ? CACHE_XPATH_HIT_REASON : unresolved.reason,
      };
    },
  );

  return { overlays, replay, treeNodes: replayedTreeNodes };
}

export function buildAndroidVisualAudit(
  root: UiNode,
  logicalSize: Size,
  treeAudit: AndroidLiveTreeAudit,
  inputs: AndroidAuditVisualElementInput[],
): AndroidVisualAudit {
  const enumerated = enumerateAndroidUiTree(root);
  const nodeById = new Map(
    treeAudit.treeNodes.map((node) => [node.nodeId, node]),
  );
  const overlayByNodeId = new Map(
    treeAudit.overlays
      .filter((overlay) => overlay.nodeId)
      .map((overlay) => [overlay.nodeId, overlay]),
  );
  const viewport: Rect = {
    left: 0,
    top: 0,
    width: logicalSize.width,
    height: logicalSize.height,
  };

  const visualElements = inputs.map((input): AndroidAuditVisualElement => {
    validateVisualInput(input);
    const point = {
      x: input.rect.left + input.rect.width / 2,
      y: input.rect.top + input.rect.height / 2,
    };
    const mappingCandidates = treeAudit.treeNodes.filter(
      (node) =>
        node.visible &&
        !isAndroidSystemBar(node) &&
        intersectionArea(node.bounds, viewport) > 0,
    );
    const mappedNode =
      semanticContainerForVisual(input, point, mappingCandidates, nodeById) ??
      mappingCandidates
        .map((node) => ({
          node,
          score: visualMappingScore(input.rect, point, node),
        }))
        .filter((candidate) => Number.isFinite(candidate.score))
        .sort((a, b) => b.score - a.score)[0]?.node;
    const expectedNode = mappedNode
      ? enumerated.nodeById.get(mappedNode.nodeId)
      : undefined;
    const feature = generateXpathCacheFeature(root, point, 'android', {
      ...ANDROID_CACHE_CANDIDATE_OPTIONS,
      expectedRect: input.rect,
      targetDescription: input.description,
    });
    let productionSelectedNodeId: string | undefined;
    if (feature) {
      try {
        const match = matchRectByXpathCache(root, feature, 'android');
        const matches = evaluateXpath(root, match.xpath);
        if (matches.length === 1) {
          productionSelectedNodeId = enumerated.idByNode.get(matches[0]);
        }
      } catch {
        // Candidate diagnostics below retain the exact source-tree result.
      }
    }
    const candidateDiagnostics =
      feature && expectedNode
        ? featureDiagnostics(root, feature, expectedNode)
        : [];
    const sourceUnique =
      Boolean(mappedNode) &&
      productionSelectedNodeId === mappedNode?.nodeId &&
      candidateDiagnostics.length > 0 &&
      candidateDiagnostics.every(
        (candidate) => candidate.matchCount === 1 && candidate.selectsNode,
      );

    let status: AndroidAuditStatus;
    let statusReason: string | undefined;
    if (!mappedNode) {
      status = productionSelectedNodeId
        ? 'point-selected-other'
        : 'not-exposed';
      statusReason = productionSelectedNodeId
        ? `The visual element has no reliable tree mapping, but production point selection chose ${productionSelectedNodeId}`
        : 'The interactive element visible in the screenshot has no corresponding Accessibility tree node';
    } else if (
      productionSelectedNodeId &&
      productionSelectedNodeId !== mappedNode.nodeId
    ) {
      status = 'point-selected-other';
      statusReason = `Production point selection chose ${productionSelectedNodeId}, while the visual element maps to ${mappedNode.nodeId}`;
    } else {
      const treeOverlay = overlayByNodeId.get(mappedNode.nodeId);
      const unresolved = unresolvedStatus(mappedNode);
      status = mappedNode.replayVerified
        ? 'cache-xpath-hit'
        : (treeOverlay?.status ?? unresolved.status);
      statusReason = mappedNode.replayVerified
        ? CACHE_XPATH_HIT_REASON
        : (treeOverlay?.statusReason ?? unresolved.reason);
    }

    return {
      ...input,
      cacheFeature: feature,
      cacheFeatureXpaths: feature?.xpaths ?? [],
      cacheFeatureXpathSources: feature?.xpathSources ?? [],
      candidateDiagnostics,
      mappedNodeId: mappedNode?.nodeId ?? null,
      point,
      productionSelectedNodeId,
      sourceUnique,
      status,
      statusReason,
      structuralXpath: mappedNode?.structuralXpath,
    };
  });

  const overlays: AndroidAuditOverlay[] = [];
  const overlaidNodeIds = new Set<string>();

  for (const element of visualElements) {
    if (element.mappedNodeId) {
      if (overlaidNodeIds.has(element.mappedNodeId)) {
        continue;
      }
      const mappedNode = nodeById.get(element.mappedNodeId);
      if (!mappedNode) {
        throw new Error(
          `Unable to resolve visual tree node ${element.mappedNodeId}`,
        );
      }
      overlays.push({
        description: element.description,
        name: element.name,
        nodeId: mappedNode.nodeId,
        rect: mappedNode.bounds,
        rectSource: 'tree',
        status: element.status,
        statusReason: element.statusReason,
        visualElementId: element.id,
      });
      overlaidNodeIds.add(mappedNode.nodeId);
      continue;
    }
    overlays.push({
      description: element.description,
      name: element.name,
      nodeId: null,
      rect: element.rect,
      rectSource: element.rectSource,
      status: element.status,
      statusReason: element.statusReason,
      visualElementId: element.id,
    });
  }

  return { visualElements, overlays };
}
