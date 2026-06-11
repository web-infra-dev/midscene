/**
 * @midscene/bdd public API.
 *
 * - `defineBddConfig` — author `midscene.config.ts`
 * - `Given` / `When` / `Then` / `defineStep` — register classic callbacks for
 *   `@no-ai` steps (standard cucumber signatures; world is `this`)
 * - `defineProfile` — cucumber config preset (also exported from
 *   `@midscene/bdd/profile`)
 *
 * The cucumber support entry lives at `@midscene/bdd/register`.
 */
export { defineBddConfig, loadBddConfig } from './config';
export { buildExploreModel, renderDashboard } from './explore';
export type { ExploreModel } from './explore';
export { Given, When, Then, defineStep } from './no-ai';
export { defineProfile } from './profile';
export type {
  BddConfig,
  ResolvedBddConfig,
  WebUiTarget,
  UiAgentFactory,
  UiAgent,
  GeneralAgent,
  GeneralAgentRequest,
  GeneralAgentResult,
  StepAnnotations,
  FlowDef,
  Skill,
} from './types';
