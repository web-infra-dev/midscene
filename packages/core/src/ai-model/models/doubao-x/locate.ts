import type { DeviceAction } from '@/device';
import type { PlanningTapLocatorDefinition } from '../../model-adapter/types';
import { getTapLocatedPixelBbox } from '../../shared/planning-action';
import { getDoubaoXFunctionDefinitions } from './actions';
import { getDoubaoXPlanningPrompt } from './prompt';

const tapOnlyActionSpace: DeviceAction[] = [{ name: 'Tap' } as DeviceAction];

export function createDoubaoXPlanningTapLocator(): PlanningTapLocatorDefinition {
  return {
    buildSystemPrompt: () =>
      `${getDoubaoXPlanningPrompt(
        getDoubaoXFunctionDefinitions(tapOnlyActionSpace),
      )}\n\nYour only goal is to locate the requested UI element and return one click action. Do not perform any other action.`,
    getLocatedPixelBbox: getTapLocatedPixelBbox,
  };
}
