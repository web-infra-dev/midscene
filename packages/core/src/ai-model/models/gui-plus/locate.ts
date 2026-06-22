import type { PlanningTapLocatorDefinition } from '../../model-adapter/types';
import { getTapLocatedPixelBbox } from '../../shared/planning-action';
import { getGuiPlus20260226ComputerUsePrompt } from './prompt';

export function createGuiPlus20260226PlanningTapLocator(): PlanningTapLocatorDefinition {
  return {
    buildSystemPrompt: getGuiPlus20260226ComputerUsePrompt,
    getLocatedPixelBbox: getTapLocatedPixelBbox,
  };
}
