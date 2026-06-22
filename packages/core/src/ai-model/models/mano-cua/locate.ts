import type { PlanningTapLocatorDefinition } from '../../model-adapter/types';
import { getTapLocatedPixelBbox } from '../../shared/planning-action';
import { getManoCuaPlanPrompt } from './prompt';

export function createManoCuaPlanningTapLocator(): PlanningTapLocatorDefinition {
  return {
    buildSystemPrompt: getManoCuaPlanPrompt,
    getLocatedPixelBbox: getTapLocatedPixelBbox,
  };
}
