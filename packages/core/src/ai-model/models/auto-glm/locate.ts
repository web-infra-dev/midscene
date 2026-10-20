import { getTapLocatedPixelResult } from '../../model-adapter/custom-planning-action';
import type { PlanningTapLocatorDefinition } from '../../model-adapter/types';
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
    getLocatedPixelResult: getTapLocatedPixelResult,
  };
}
