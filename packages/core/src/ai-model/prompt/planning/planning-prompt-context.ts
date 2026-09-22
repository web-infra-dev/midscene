import type { DeviceAction } from '@/types';
import { getPreferredLanguage } from '@midscene/shared/env';
import type { StandardPlanningProtocol } from '../../model-adapter/planning-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import { planningModelFamilyRequiredForLocateMessage } from '../../shared/model-locate-result/errors';
import { buildPlanningActionSpaceDescription } from './action-space-description';

export type BuildStandardPlanningSystemPromptInput = {
  actionSpace: DeviceAction<any>[];
  planningProtocol: StandardPlanningProtocol;
} & (
  | {
      includeLocateInPlanning: true;
      locatePromptSpec: LocateResultPromptSpec;
    }
  | {
      includeLocateInPlanning: false;
      locatePromptSpec?: never;
    }
);

export function createPlanningPromptContext(
  input: BuildStandardPlanningSystemPromptInput,
) {
  const {
    actionSpace,
    includeLocateInPlanning,
    locatePromptSpec,
    planningProtocol,
  } = input;
  const actionOutputProtocol = planningProtocol.actionOutputProtocol;
  const preferredLanguage = getPreferredLanguage();

  if (includeLocateInPlanning && !locatePromptSpec) {
    throw new Error(planningModelFamilyRequiredForLocateMessage());
  }

  const actionSpaceDescription = buildPlanningActionSpaceDescription({
    actionSpace,
    locatePromptSpec,
    planningProtocol,
  });
  const hasRunAdbShell = actionSpace.some(
    (action) => action.name === 'RunAdbShell',
  );
  const actionOutputTagsText = actionOutputProtocol.actionOutputTagNames
    .map((tagName) => `<${tagName}>`)
    .join(', ');

  return {
    locatePromptSpec,
    includeLocateInPlanning,
    planningProtocol,
    actionOutputProtocol,
    preferredLanguage,
    actionSpaceDescription,
    hasRunAdbShell,
    actionOutputTagsText,
  };
}

export type PlanningPromptContext = ReturnType<
  typeof createPlanningPromptContext
>;
