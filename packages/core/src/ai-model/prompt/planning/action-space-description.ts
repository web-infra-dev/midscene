import {
  INCREMENTAL_EDIT_GUIDANCE,
  SLIDER_SWIPE_EXAMPLE,
  USER_REQUEST_ONLY_GUIDANCE,
} from '@/device/action-guidance';
import type { DeviceAction } from '@/types';
import yaml from 'js-yaml';
import type {
  PlanningActionSpaceFormat,
  StandardPlanningProtocol,
} from '../../model-adapter/planning-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import {
  type PlanningAblation,
  planningPartEnabled,
} from '../../workflows/planning/ablation';
import { buildActionOutputExample } from './action-output-example';

type BuildPlanningActionSpaceDescriptionInput = {
  actionSpace: DeviceAction<any>[];
  locatePromptSpec?: LocateResultPromptSpec;
  planningProtocol: StandardPlanningProtocol;
  ablation?: PlanningAblation;
};

export const serializeActionDescriptions = (
  actionDescriptions: unknown[],
  format: PlanningActionSpaceFormat,
) => {
  if (format === 'jsonl') {
    return actionDescriptions
      .map((description) => JSON.stringify(description))
      .join('\n');
  }

  return yaml
    .dump(actionDescriptions, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    })
    .trim();
};

export const buildPlanningActionSpaceDescription = ({
  actionSpace,
  locatePromptSpec,
  planningProtocol,
  ablation = [],
}: BuildPlanningActionSpaceDescriptionInput) => {
  const locateFieldDescription =
    planningProtocol.actionSpaceProtocol.buildLocateFieldDescription(
      locatePromptSpec,
    );
  const projectDescription = (description: string) => {
    let result = description;
    if (!planningPartEnabled(ablation, 'taskScope'))
      result = result.replaceAll(USER_REQUEST_ONLY_GUIDANCE, '');
    if (!planningPartEnabled(ablation, 'incrementalEdit'))
      result = result.replaceAll(INCREMENTAL_EDIT_GUIDANCE, '');
    if (!planningPartEnabled(ablation, 'sliderSwipe'))
      result = result.replaceAll(SLIDER_SWIPE_EXAMPLE, '');
    return result;
  };
  const actionDescriptions = actionSpace.map((action) => {
    const actionOutputExample =
      planningProtocol.actionSpaceProtocol.includeActionOutputExample &&
      planningPartEnabled(ablation, 'actionExamples')
        ? buildActionOutputExample(action, {
            locatePromptSpec,
            buildActionOutput:
              planningProtocol.actionOutputProtocol.buildActionOutput,
          })
        : undefined;
    return planningProtocol.actionSpaceProtocol.buildActionDescription({
      action,
      locateFieldDescription,
      actionOutputExample,
      ...(ablation.length
        ? {
            includeDescriptions: planningPartEnabled(
              ablation,
              'actionDescriptions',
            ),
            projectDescription,
          }
        : {}),
    });
  });

  return serializeActionDescriptions(
    actionDescriptions,
    planningProtocol.actionSpaceProtocol.format,
  );
};
