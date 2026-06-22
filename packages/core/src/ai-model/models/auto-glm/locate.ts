import type { PlanningTapLocatorDefinition } from '../../model-adapter/types';
import { getTapLocatedPixelBbox } from '../../shared/planning-action';
import {
  getAutoGLMChineseLocatePrompt,
  getAutoGLMMultilingualLocatePrompt,
} from './prompt';

export function createAutoGlmPlanningTapLocator(
  isMultilingual: boolean,
): PlanningTapLocatorDefinition {
  return {
    buildSystemPrompt: () =>
      isMultilingual
        ? getAutoGLMMultilingualLocatePrompt()
        : getAutoGLMChineseLocatePrompt(),
    getLocatedPixelBbox: getTapLocatedPixelBbox,
  };
}
