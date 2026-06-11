/**
 * Flow-graph scene builder: a faithful port of the legacy template's layered
 * left→right layout (flow layering, link dedupe, two-pass barycenter
 * ordering, bezier edge routing, dependency cones) as pure functions. The
 * React component only renders the scene this module computes.
 */
import type { ExploreModel } from '@midscene/bdd';
import { type ModelIndices, argsSummary, flowSub, plural } from './indices';

export const NODE_W = 280;
const NODE_H = 48;
const NODE_H_SMALL = 34;
const COL_GAP = 130; // horizontal room between columns for the edges
const ROW_GAP = 14;
const BAND_LABEL_H = 36;
const PAD = 28;

export type GraphNodeKind = 'feature' | 'scenario' | 'flow';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  layer: number;
  /** Deterministic tiebreak: document/model order. */
  order: number;
  small: boolean;
  label: string;
  sub: string;
  unused: boolean;
  focus: boolean;
  x: number;
  y: number;
  h: number;
}

export interface GraphLink {
  from: string;
  to: string;
  label: string;
  count: number;
  isFlowEdge: boolean;
  /** Bezier path between the two node anchors. */
  d: string;
  labelX: number;
  labelY: number;
}

export interface GraphBand {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface GraphScene {
  nodes: GraphNode[];
  links: GraphLink[];
  bands: GraphBand[];
  width: number;
  height: number;
  hiddenNote: string;
  nodeById: Map<string, GraphNode>;
}

export interface GraphOptions {
  /** true: one node per scenario; false: aggregate per feature. */
  everyScenario: boolean;
  /** When set, build the focus subgraph around this flow instead. */
  focusFlowId: string | null;
}

interface DraftNode {
  id: string;
  kind: GraphNodeKind;
  layer: number;
  order: number;
  small?: boolean;
  label: string;
  sub: string;
  unused?: boolean;
  focus?: boolean;
}

interface RawLink {
  from: string;
  to: string;
  label: string;
  count?: number;
}

/**
 * Layer of each flow: 1 for flows only called from scenarios (or unused),
 * +1 per flow-to-flow hop. Iterative relaxation with a guard so cycles
 * terminate.
 */
function flowLayers(model: ExploreModel): Map<string, number> {
  const layer = new Map<string, number>();
  for (const flow of model.flows) layer.set(flow.id, 1);
  let changed = true;
  let guard = 0;
  while (changed && guard < 10) {
    changed = false;
    guard++;
    for (const edge of model.edges) {
      if (!edge.from.startsWith('flow:') || !layer.has(edge.to)) continue;
      const want = (layer.get(edge.from) ?? 1) + 1;
      if (want > (layer.get(edge.to) ?? 1) && want <= 8) {
        layer.set(edge.to, want);
        changed = true;
      }
    }
  }
  return layer;
}

function dedupeLinks(raw: RawLink[]): RawLink[] {
  const byKey = new Map<string, RawLink>();
  const out: RawLink[] = [];
  for (const link of raw) {
    const key = `${link.from}→${link.to}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count = (existing.count ?? 1) + 1;
      continue;
    }
    link.count = link.count ?? 1;
    byKey.set(key, link);
    out.push(link);
  }
  for (const link of out) {
    if ((link.count ?? 1) > 1) {
      link.label = `${plural(link.count ?? 1, 'call')} — ${link.label}`;
    }
  }
  return out;
}

/**
 * The whole dependency picture, left to right: layer 0 (leftmost column) =
 * the dependents (every scenario individually, or aggregated feature nodes),
 * flows by call depth to the right. Returns the hidden-caller count.
 */
function buildFullGraph(
  model: ExploreModel,
  indices: ModelIndices,
  everyScenario: boolean,
  nodes: DraftNode[],
  rawLinks: RawLink[],
): number {
  const layers = flowLayers(model);
  let hiddenCallers = 0;
  let order = 0;
  if (everyScenario) {
    for (const feature of model.features) {
      for (const scenario of feature.scenarios) {
        const outs = indices.edgesFrom.get(scenario.id) ?? [];
        if (outs.length === 0) {
          hiddenCallers++;
          continue;
        }
        nodes.push({
          id: scenario.id,
          kind: 'scenario',
          layer: 0,
          order: order++,
          small: true,
          label: scenario.name,
          sub: feature.name,
        });
        for (const edge of outs) {
          rawLinks.push({
            from: scenario.id,
            to: edge.to,
            label: argsSummary(edge.args),
          });
        }
      }
    }
  } else {
    // feature id -> flow id -> call count
    const featureCalls = new Map<string, Map<string, number>>();
    for (const edge of model.edges) {
      if (!edge.from.startsWith('scenario:')) continue;
      const feature = indices.featureOfScenario.get(edge.from);
      if (!feature) continue;
      let agg = featureCalls.get(feature.id);
      if (!agg) {
        agg = new Map();
        featureCalls.set(feature.id, agg);
      }
      agg.set(edge.to, (agg.get(edge.to) ?? 0) + 1);
    }
    for (const feature of model.features) {
      const agg = featureCalls.get(feature.id);
      if (!agg) {
        hiddenCallers++;
        continue;
      }
      nodes.push({
        id: feature.id,
        kind: 'feature',
        layer: 0,
        order: order++,
        label: feature.name,
        sub: plural(feature.scenarios.length, 'scenario'),
      });
      for (const flowId of [...agg.keys()].sort()) {
        const count = agg.get(flowId) ?? 0;
        rawLinks.push({
          from: feature.id,
          to: flowId,
          label: plural(count, 'call'),
          count,
        });
      }
    }
  }
  for (const flow of model.flows) {
    nodes.push({
      id: flow.id,
      kind: 'flow',
      layer: layers.get(flow.id) ?? 1,
      order: order++,
      label: flow.name,
      sub: flowSub(flow),
      unused: (indices.edgesTo.get(flow.id) ?? []).length === 0,
    });
  }
  for (const edge of model.edges) {
    if (!edge.from.startsWith('flow:')) continue;
    rawLinks.push({
      from: edge.from,
      to: edge.to,
      label: argsSummary(edge.args),
    });
  }
  return hiddenCallers;
}

/**
 * Focus subgraph: the flow's direct callers in the left column, the flow,
 * then its transitive callees continuing right.
 */
function buildFocusGraph(
  indices: ModelIndices,
  focusFlowId: string,
  nodes: DraftNode[],
  rawLinks: RawLink[],
): void {
  const focus = indices.flowById.get(focusFlowId);
  if (!focus) return;
  const seen = new Set<string>([focusFlowId]);
  let order = 0;
  nodes.push({
    id: focusFlowId,
    kind: 'flow',
    layer: 1,
    order: order++,
    label: focus.name,
    sub: flowSub(focus),
    focus: true,
  });
  for (const edge of indices.edgesTo.get(focusFlowId) ?? []) {
    if (!seen.has(edge.from)) {
      seen.add(edge.from);
      const isFlow = edge.from.startsWith('flow:');
      const caller = isFlow
        ? indices.flowById.get(edge.from)
        : indices.scenarioById.get(edge.from);
      const sub = isFlow
        ? ''
        : (indices.featureOfScenario.get(edge.from)?.name ?? '');
      nodes.push({
        id: edge.from,
        kind: isFlow ? 'flow' : 'scenario',
        layer: 0,
        order: order++,
        small: !isFlow,
        label: caller ? caller.name : edge.from,
        sub,
      });
    }
    rawLinks.push({
      from: edge.from,
      to: focusFlowId,
      label: argsSummary(edge.args),
    });
  }
  let frontier = [focusFlowId];
  let layer = 2;
  while (frontier.length > 0 && layer < 10) {
    const next: string[] = [];
    for (const src of frontier) {
      for (const edge of indices.edgesFrom.get(src) ?? []) {
        if (!edge.to.startsWith('flow:')) continue;
        if (!seen.has(edge.to)) {
          seen.add(edge.to);
          const callee = indices.flowById.get(edge.to);
          nodes.push({
            id: edge.to,
            kind: 'flow',
            layer,
            order: order++,
            label: callee ? callee.name : edge.to,
            sub: callee ? flowSub(callee) : '',
          });
          next.push(edge.to);
        }
        rawLinks.push({
          from: src,
          to: edge.to,
          label: argsSummary(edge.args),
        });
      }
    }
    frontier = next;
    layer++;
  }
}

/**
 * Columns left→right by layer. Node order inside each column comes from a
 * two-pass barycenter sweep (sort by the mean y of placed neighbors) so
 * chains stay roughly horizontal and edge crossings stay low — fully
 * deterministic (ties fall back to document/model order).
 */
function layoutScene(
  drafts: DraftNode[],
  rawLinks: RawLink[],
  layerLabels: string[],
  hiddenNote: string,
): GraphScene {
  const nodes: GraphNode[] = drafts.map((draft) => ({
    ...draft,
    small: draft.small ?? false,
    unused: draft.unused ?? false,
    focus: draft.focus ?? false,
    x: 0,
    y: 0,
    h: draft.small ? NODE_H_SMALL : NODE_H,
  }));

  const byLayer: GraphNode[][] = [];
  for (const node of nodes) {
    if (!byLayer[node.layer]) byLayer[node.layer] = [];
    byLayer[node.layer].push(node);
  }
  const cols: { layer: number; list: GraphNode[]; bottom: number }[] = [];
  byLayer.forEach((list, layerIndex) => {
    if (list && list.length > 0) {
      cols.push({ layer: layerIndex, list, bottom: 0 });
    }
  });

  const sourcesOf = new Map<string, string[]>(); // node id -> ids it links to
  const targetsOf = new Map<string, string[]>(); // node id -> ids linking to it
  for (const link of rawLinks) {
    let sources = sourcesOf.get(link.from);
    if (!sources) {
      sources = [];
      sourcesOf.set(link.from, sources);
    }
    sources.push(link.to);
    let targets = targetsOf.get(link.to);
    if (!targets) {
      targets = [];
      targetsOf.set(link.to, targets);
    }
    targets.push(link.from);
  }

  const center = new Map<string, number>();
  const sortKey = new Map<string, number>();
  function placeColumn(
    col: { layer: number; list: GraphNode[]; bottom: number },
    colIndex: number,
  ): void {
    const x = PAD + colIndex * (NODE_W + COL_GAP);
    let y = PAD + BAND_LABEL_H;
    for (const node of col.list) {
      node.x = x;
      node.y = y;
      center.set(node.id, y + node.h / 2);
      y += node.h + ROW_GAP;
    }
    col.bottom = y - ROW_GAP;
  }
  function meanCenter(ids: string[] | undefined): number | null {
    let sum = 0;
    let count = 0;
    for (const id of ids ?? []) {
      const value = center.get(id);
      if (value !== undefined) {
        sum += value;
        count++;
      }
    }
    return count > 0 ? sum / count : null;
  }
  function sortByNeighbors(
    list: GraphNode[],
    neighborsOf: Map<string, string[]>,
  ): void {
    for (const node of list) {
      const key = meanCenter(neighborsOf.get(node.id));
      // Nodes with no placed neighbors sink to the bottom, in model order.
      sortKey.set(node.id, key === null ? 1e9 + node.order : key);
    }
    list.sort(
      (a, b) =>
        (sortKey.get(a.id) ?? 0) - (sortKey.get(b.id) ?? 0) ||
        a.order - b.order,
    );
  }

  // Pass 1: entry column in document order, each flow column pulled toward
  // its callers. Pass 2: pull the entry column toward the flows it calls,
  // then settle the flow columns once more.
  cols.forEach((col, colIndex) => {
    if (colIndex === 0) col.list.sort((a, b) => a.order - b.order);
    else sortByNeighbors(col.list, targetsOf);
    placeColumn(col, colIndex);
  });
  if (cols.length > 1) {
    sortByNeighbors(cols[0].list, sourcesOf);
    cols.forEach((col, colIndex) => {
      if (colIndex > 0) sortByNeighbors(col.list, targetsOf);
      placeColumn(col, colIndex);
    });
  }

  const width = PAD * 2 + cols.length * (NODE_W + COL_GAP) - COL_GAP;
  let height = PAD;
  for (const col of cols) {
    if (col.bottom > height) height = col.bottom;
  }
  height += PAD;

  const bands: GraphBand[] = cols.map((col, colIndex) => ({
    x: PAD + colIndex * (NODE_W + COL_GAP) - 12,
    y: PAD - 10,
    width: NODE_W + 24,
    height: height - PAD * 2 + 20,
    label: `${layerLabels[col.layer] ?? `DEPTH ${col.layer}`} · ${col.list.length}`,
  }));

  const nodeById = new Map<string, GraphNode>();
  for (const node of nodes) nodeById.set(node.id, node);

  const links: GraphLink[] = [];
  for (const raw of rawLinks) {
    const source = nodeById.get(raw.from);
    const target = nodeById.get(raw.to);
    if (!source || !target) continue;
    const x1 = source.x + NODE_W;
    const y1 = source.y + source.h / 2;
    const x2 = target.x;
    const y2 = target.y + target.h / 2;
    let d: string;
    if (x2 > x1) {
      const mx = (x1 + x2) / 2;
      d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    } else {
      // Back/leftward edge (cycle): swing around above both nodes.
      const yo = Math.min(source.y, target.y) - 56;
      d = `M ${x1} ${y1} C ${x1 + 56} ${yo}, ${x2 - 56} ${yo}, ${x2} ${y2}`;
    }
    links.push({
      from: raw.from,
      to: raw.to,
      label: raw.label,
      count: raw.count ?? 1,
      isFlowEdge: raw.from.startsWith('flow:') && raw.to.startsWith('flow:'),
      d,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2 - 5,
    });
  }

  return { nodes, links, bands, width, height, hiddenNote, nodeById };
}

export function buildGraphScene(
  model: ExploreModel,
  indices: ModelIndices,
  options: GraphOptions,
): GraphScene {
  const drafts: DraftNode[] = [];
  const rawLinks: RawLink[] = [];
  let layerLabels: string[];
  let hiddenNote = '';

  if (options.focusFlowId && indices.flowById.has(options.focusFlowId)) {
    buildFocusGraph(indices, options.focusFlowId, drafts, rawLinks);
    layerLabels = ['CALLERS', 'FOCUSED FLOW', 'CALLEES'];
    for (let depth = 2; depth <= 8; depth++) {
      layerLabels.push(`CALLEES · DEPTH ${depth}`);
    }
  } else {
    const hidden = buildFullGraph(
      model,
      indices,
      options.everyScenario,
      drafts,
      rawLinks,
    );
    layerLabels = [options.everyScenario ? 'SCENARIOS' : 'FEATURES', 'FLOWS'];
    for (let depth = 2; depth <= 8; depth++) {
      layerLabels.push(`NESTED FLOWS · DEPTH ${depth}`);
    }
    if (hidden > 0) {
      hiddenNote = `${hidden} ${
        options.everyScenario ? 'scenarios' : 'features'
      } without flow calls hidden`;
    }
  }

  if (drafts.length === 0) {
    return {
      nodes: [],
      links: [],
      bands: [],
      width: 0,
      height: 0,
      hiddenNote,
      nodeById: new Map(),
    };
  }

  return layoutScene(drafts, dedupeLinks(rawLinks), layerLabels, hiddenNote);
}

// ———————————————————————— dependency cone ————————————————————————

export interface DependencyCone {
  rootId: string;
  nodes: Set<string>;
  links: Set<number>;
}

/**
 * Transitive closure of one node over the DRAWN graph: ancestors (everything
 * that depends on it, via reverse BFS) plus descendants (everything it
 * depends on, via forward BFS). Visited-link marking makes cycles terminate.
 */
export function computeCone(
  rootId: string,
  links: GraphLink[],
): DependencyCone {
  const byTo = new Map<string, number[]>();
  const byFrom = new Map<string, number[]>();
  links.forEach((link, index) => {
    let to = byTo.get(link.to);
    if (!to) {
      to = [];
      byTo.set(link.to, to);
    }
    to.push(index);
    let from = byFrom.get(link.from);
    if (!from) {
      from = [];
      byFrom.set(link.from, from);
    }
    from.push(index);
  });

  const nodesIn = new Set<string>([rootId]);
  const linksIn = new Set<number>();
  let stack = [rootId];
  while (stack.length > 0) {
    // ancestors
    const cur = stack.pop() as string;
    for (const index of byTo.get(cur) ?? []) {
      if (linksIn.has(index)) continue;
      linksIn.add(index);
      const from = links[index].from;
      if (!nodesIn.has(from)) {
        nodesIn.add(from);
        stack.push(from);
      }
    }
  }
  stack = [rootId];
  while (stack.length > 0) {
    // descendants
    const cur = stack.pop() as string;
    for (const index of byFrom.get(cur) ?? []) {
      if (linksIn.has(index)) continue;
      linksIn.add(index);
      const to = links[index].to;
      if (!nodesIn.has(to)) {
        nodesIn.add(to);
        stack.push(to);
      }
    }
  }
  return { rootId, nodes: nodesIn, links: linksIn };
}
