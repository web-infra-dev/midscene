import type { DeviceAction } from '@/types';
import yaml from 'js-yaml';
import type {
  PlanningActionSpaceFormat,
  StandardPlanningProtocol,
} from '../../model-adapter/planning-protocol';
import type { LocateResultPromptSpec } from '../../shared/model-locate-result';
import { buildActionOutputExample } from './action-output-example';

type BuildPlanningActionSpaceDescriptionInput = {
  actionSpace: DeviceAction<any>[];
  locatePromptSpec?: LocateResultPromptSpec;
  planningProtocol: StandardPlanningProtocol;
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
}: BuildPlanningActionSpaceDescriptionInput) => {
  const locateFieldDescription =
    planningProtocol.actionSpaceProtocol.buildLocateFieldDescription(
      locatePromptSpec,
    );
  const actionDescriptions = actionSpace.map((action) => {
    const actionOutputExample = planningProtocol.actionSpaceProtocol
      .includeActionOutputExample
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
    });
  });

  return serializeActionDescriptions(
    actionDescriptions,
    planningProtocol.actionSpaceProtocol.format,
  );
};
