/**
 * Flattened sidebar tree: feature groups (scenarios) plus one Flows group,
 * filtered by the search query. Flat rows feed the virtualized list and the
 * keyboard navigation order.
 */
import type { ExploreModel } from '@midscene/bdd';
import { type ModelIndices, matchesQuery } from './indices';
import type { FlowModel, ScenarioModel } from './types';

export type TreeEntry =
  | {
      type: 'head';
      key: string;
      label: string;
      count: number;
      open: boolean;
      flowsGroup: boolean;
    }
  | { type: 'scenario'; groupKey: string; item: ScenarioModel }
  | { type: 'flow'; groupKey: string; item: FlowModel };

export interface TreeData {
  entries: TreeEntry[];
  /** Selectable item ids in visible order (open groups only). */
  itemIds: string[];
  matchedScenarios: number;
  matchedFlows: number;
}

export const FLOWS_GROUP_KEY = '__flows__';

export function buildTree(
  model: ExploreModel,
  indices: ModelIndices,
  query: string,
  collapsed: Record<string, boolean>,
): TreeData {
  const entries: TreeEntry[] = [];
  const itemIds: string[] = [];
  let matchedScenarios = 0;
  let matchedFlows = 0;

  for (const feature of model.features) {
    const visible = feature.scenarios.filter((scenario) =>
      matchesQuery(indices, scenario.id, query),
    );
    // Hide empty features and, while searching, features with no hits.
    if (visible.length === 0 && (query || feature.scenarios.length === 0)) {
      continue;
    }
    matchedScenarios += visible.length;
    // While searching, force groups with hits open so matches stay visible.
    const open = query ? true : !collapsed[feature.id];
    entries.push({
      type: 'head',
      key: feature.id,
      label: feature.name,
      count: visible.length,
      open,
      flowsGroup: false,
    });
    if (open) {
      for (const scenario of visible) {
        entries.push({
          type: 'scenario',
          groupKey: feature.id,
          item: scenario,
        });
        itemIds.push(scenario.id);
      }
    }
  }

  const flowsVisible = model.flows.filter((flow) =>
    matchesQuery(indices, flow.id, query),
  );
  if (flowsVisible.length > 0) {
    matchedFlows = flowsVisible.length;
    const open = query ? true : !collapsed[FLOWS_GROUP_KEY];
    entries.push({
      type: 'head',
      key: FLOWS_GROUP_KEY,
      label: 'Flows',
      count: flowsVisible.length,
      open,
      flowsGroup: true,
    });
    if (open) {
      for (const flow of flowsVisible) {
        entries.push({ type: 'flow', groupKey: FLOWS_GROUP_KEY, item: flow });
        itemIds.push(flow.id);
      }
    }
  }

  return { entries, itemIds, matchedScenarios, matchedFlows };
}
