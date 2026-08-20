import { findAllMidsceneLocatorField } from '@/common';
import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ParsedPlanningLocateParameter } from '../../model-adapter/planning-protocol';
import type {
  LocateResultAdapter,
  LocateResultContext,
} from '../../shared/model-locate-result/types';

const debug = getDebug('planning');

export function normalizePlanningActionLocateFields(
  actions: PlanningAction[],
  {
    actionSpace,
    includeLocateInPlanning,
    locateResultAdapter,
    locateResultContext,
    parseRawLocateParameter,
  }: {
    actionSpace: DeviceAction[];
    includeLocateInPlanning: boolean;
    locateResultAdapter?: LocateResultAdapter;
    locateResultContext: LocateResultContext;
    parseRawLocateParameter: (value: unknown) => ParsedPlanningLocateParameter;
  },
): void {
  actions.forEach((action) => {
    const actionInActionSpace = actionSpace.find(
      (actionInSpace) => actionInSpace.name === action.type,
    );
    if (!actionInActionSpace) {
      debug('skip locate normalization for action outside actionSpace', action);
      return;
    }

    debug('actionInActionSpace matched', actionInActionSpace);
    const locateFields = findAllMidsceneLocatorField(
      actionInActionSpace.paramSchema,
    );

    debug('locateFields', locateFields);

    locateFields.forEach((field) => {
      const rawLocateParameter = action.param?.[field];
      if (!rawLocateParameter) {
        return;
      }

      const locateParameter = parseRawLocateParameter(rawLocateParameter);

      if (!includeLocateInPlanning) {
        // In prompt-only planning mode, ignore any accidental coordinates from the model.
        action.param[field] = { prompt: locateParameter.prompt };
        return;
      }

      assert(
        locateResultAdapter,
        'planning locate normalization requires a locate result adapter',
      );
      action.param[field] = {
        ...locateParameter,
        locatedPixelBbox: locateResultAdapter.adaptPlanningParamToPixelBbox(
          locateParameter,
          locateResultContext,
        ),
      };
    });
  });
}
