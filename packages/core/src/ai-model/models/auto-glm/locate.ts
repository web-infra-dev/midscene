import type { PixelBbox, PlanningAction } from '@/types';
import type { PlanningActionLocatorDefinition } from '../../workflows/inspect/planning-action-locate';
import {
  getAutoGLMChineseLocatePrompt,
  getAutoGLMMultilingualLocatePrompt,
} from './prompt';

type TapPlanningAction = PlanningAction<{
  locate: {
    locatedPixelBbox: PixelBbox;
  };
}>;

function getTapLocatedPixelBbox(
  actions: PlanningAction[],
): PixelBbox | undefined {
  for (const action of actions) {
    if (action.type !== 'Tap') {
      continue;
    }

    return (action as TapPlanningAction).param.locate.locatedPixelBbox;
  }

  return undefined;
}

export function createAutoGlmLocator(
  isMultilingual: boolean,
): PlanningActionLocatorDefinition {
  return {
    buildSystemPrompt: () =>
      isMultilingual
        ? getAutoGLMMultilingualLocatePrompt()
        : getAutoGLMChineseLocatePrompt(),
    getLocatedPixelBbox: getTapLocatedPixelBbox,
  };
}
