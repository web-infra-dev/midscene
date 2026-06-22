import type { PlanningTapLocatorDefinition } from '../../model-adapter/types';
import { getTapLocatedPixelBbox } from '../../shared/planning-action';
import { getMaiUiPlanPrompt } from './prompt';

export function createMaiUiPlanningTapLocator(): PlanningTapLocatorDefinition {
  return {
    buildSystemPrompt: getMaiUiPlanPrompt,
    getLocatedPixelBbox: getTapLocatedPixelBbox,
  };
}
