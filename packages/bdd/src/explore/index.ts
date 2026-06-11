/**
 * Dashboard explorer for @midscene/bdd: a static HTML view of the suite's
 * stories, composed flows and health findings — a pure function of the
 * feature files (no run, no model, no browser).
 */
export { buildExploreModel } from './model';
export type {
  ExploreEdge,
  ExploreModel,
  ExploreStats,
  FeatureModel,
  FlowModel,
  HealthFinding,
  HealthKind,
  ScenarioModel,
  StepModel,
  StepRoute,
} from './model';
export { renderDashboard } from './render';
