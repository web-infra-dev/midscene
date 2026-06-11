/**
 * Narrow type aliases derived from the one type `@midscene/bdd` exports.
 * Indexed-access keeps the app in lockstep with the package without asking
 * packages/bdd to export its whole internal type surface.
 */
import type { ExploreModel } from '@midscene/bdd';

export type FeatureModel = ExploreModel['features'][number];
export type ScenarioModel = FeatureModel['scenarios'][number];
export type FlowModel = ExploreModel['flows'][number];
export type StepModel = FlowModel['steps'][number];
export type ExploreEdge = ExploreModel['edges'][number];
export type HealthFinding = ExploreModel['health'][number];
export type HealthKind = HealthFinding['kind'];
export type StepRoute = StepModel['route'];

export type StoryItem = ScenarioModel | FlowModel;

export type DashboardView = 'stories' | 'graph' | 'health';
