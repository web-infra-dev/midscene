/**
 * Lookup indices over an ExploreModel, built once per model. Mirrors the
 * index tables the legacy template built at parse time (flowById,
 * featureOfScenario, edge adjacency, search haystacks).
 */
import type {
  ExploreEdge,
  ExploreModel,
  FeatureModel,
  FlowModel,
  ScenarioModel,
  StoryItem,
} from './types';

export interface ModelIndices {
  flowById: Map<string, FlowModel>;
  scenarioById: Map<string, ScenarioModel>;
  featureById: Map<string, FeatureModel>;
  /** scenario id -> owning feature */
  featureOfScenario: Map<string, FeatureModel>;
  /** flow id -> incoming edges */
  edgesTo: Map<string, ExploreEdge[]>;
  /** owner id -> outgoing edges */
  edgesFrom: Map<string, ExploreEdge[]>;
  /** Lowercased search haystack per scenario/flow id. */
  haystack: Map<string, string>;
}

// Routing markers are searchable ("@agent", "@no-ai", "$skill") even when
// they live in comment lines the step text does not contain.
function buildHaystack(item: StoryItem): string {
  const tags = 'tags' in item ? item.tags : [];
  const parts: string[] = [item.name, ...tags];
  for (const step of item.steps) {
    parts.push(step.text);
    if (step.route !== 'ui') parts.push(`@${step.route}`);
    for (const skill of step.annotations.skills) parts.push(`$${skill}`);
  }
  return parts.join('\n').toLowerCase();
}

export function buildIndices(model: ExploreModel): ModelIndices {
  const flowById = new Map<string, FlowModel>();
  const scenarioById = new Map<string, ScenarioModel>();
  const featureById = new Map<string, FeatureModel>();
  const featureOfScenario = new Map<string, FeatureModel>();
  const edgesTo = new Map<string, ExploreEdge[]>();
  const edgesFrom = new Map<string, ExploreEdge[]>();
  const haystack = new Map<string, string>();

  for (const flow of model.flows) {
    flowById.set(flow.id, flow);
    haystack.set(flow.id, buildHaystack(flow));
  }
  for (const feature of model.features) {
    featureById.set(feature.id, feature);
    for (const scenario of feature.scenarios) {
      scenarioById.set(scenario.id, scenario);
      featureOfScenario.set(scenario.id, feature);
      haystack.set(scenario.id, buildHaystack(scenario));
    }
  }
  for (const edge of model.edges) {
    const to = edgesTo.get(edge.to);
    if (to) to.push(edge);
    else edgesTo.set(edge.to, [edge]);
    const from = edgesFrom.get(edge.from);
    if (from) from.push(edge);
    else edgesFrom.set(edge.from, [edge]);
  }

  return {
    flowById,
    scenarioById,
    featureById,
    featureOfScenario,
    edgesTo,
    edgesFrom,
    haystack,
  };
}

export function matchesQuery(
  indices: ModelIndices,
  id: string,
  query: string,
): boolean {
  if (!query) return true;
  return (indices.haystack.get(id) ?? '').includes(query);
}

// ———————————————————————— shared text helpers ————————————————————————

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function argsSummary(args: Record<string, string>): string {
  const keys = Object.keys(args ?? {});
  if (keys.length === 0) return 'no args';
  return keys.map((key) => `${key} = "${args[key]}"`).join(', ');
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface FlowRouteCounts {
  agent: number;
  noAi: number;
}

export function flowRouteCounts(flow: FlowModel): FlowRouteCounts {
  let agent = 0;
  let noAi = 0;
  for (const step of flow.steps) {
    if (step.route === 'agent') agent++;
    else if (step.route === 'no-ai') noAi++;
  }
  return { agent, noAi };
}

/**
 * Graph node subtitle for a flow: params plus a routing marker when the
 * flow body contains agent / no-ai steps.
 */
export function flowSub(flow: FlowModel): string {
  let sub = plural(flow.params.length, 'param');
  const counts = flowRouteCounts(flow);
  if (counts.agent > 0) sub += ` · ◆ ${counts.agent} agent`;
  if (counts.noAi > 0) sub += ` · ${counts.noAi} no-ai`;
  return sub;
}
