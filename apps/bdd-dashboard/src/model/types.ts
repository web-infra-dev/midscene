/**
 * ExploreModel contract mirrored from packages/bdd/src/explore/model.ts.
 * The dashboard app consumes the JSON payload directly, so it should not
 * require @midscene/bdd build artifacts just for type-checking.
 */
export type HealthKind =
  | 'unused-flow'
  | 'ambiguous-flow-match'
  | 'unknown-flow-sugar'
  | 'undeclared-param'
  | 'detached-annotation'
  | 'legacy-annotation'
  | 'tag-level-agent'
  | 'missing-skill'
  | 'flow-depth';

export interface HealthFinding {
  kind: HealthKind;
  message: string;
  uri?: string;
  line?: number;
  subject?: string;
}

export interface StepAnnotations {
  agent: boolean;
  noAi: boolean;
  soft: boolean;
  skills: string[];
}

export type StepType = 'context' | 'action' | 'outcome' | 'unknown';
export type StepRoute = 'ui' | 'agent' | 'no-ai';

export interface StepModel {
  keyword: string;
  text: string;
  stepType: StepType;
  annotations: StepAnnotations;
  route: StepRoute;
  dataTable?: string;
  docString?: string;
  line: number;
  flowCall?: { flowId: string; args: Record<string, string> };
  paramUses?: string[];
  paramIssues?: string[];
}

export interface ScenarioModel {
  id: string;
  name: string;
  tags: string[];
  uri: string;
  line: number;
  isOutline: boolean;
  exampleCount?: number;
  steps: StepModel[];
}

export interface FeatureModel {
  id: string;
  uri: string;
  relPath: string;
  name: string;
  description?: string;
  tags: string[];
  scenarios: ScenarioModel[];
}

export interface FlowModel {
  id: string;
  name: string;
  params: string[];
  uri: string;
  line: number;
  steps: StepModel[];
  callers: string[];
}

export interface ExploreEdge {
  from: string;
  to: string;
  stepIndex: number;
  args: Record<string, string>;
}

export interface ExploreStats {
  features: number;
  scenarios: number;
  flows: number;
  steps: number;
  edges: number;
  agentSteps: number;
  noAiSteps: number;
}

export interface ExploreModel {
  generatedAt: string;
  baseDir: string;
  features: FeatureModel[];
  flows: FlowModel[];
  edges: ExploreEdge[];
  health: HealthFinding[];
  stats: ExploreStats;
}

export type StoryItem = ScenarioModel | FlowModel;

export type DashboardView = 'stories' | 'graph' | 'health';
