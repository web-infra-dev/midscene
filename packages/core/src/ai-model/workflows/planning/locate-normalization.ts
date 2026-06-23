import {
  findActionInActionSpaceOrThrow,
  findAllMidsceneLocatorField,
} from '@/common';
import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
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
  }: {
    actionSpace: DeviceAction[];
    includeLocateInPlanning: boolean;
    locateResultAdapter?: LocateResultAdapter;
    locateResultContext: LocateResultContext;
  },
): void {
  actions.forEach((action) => {
    const actionInActionSpace = findActionInActionSpaceOrThrow(
      action.type,
      actionSpace,
    );

    debug('actionInActionSpace matched', actionInActionSpace);
    const locateFields = findAllMidsceneLocatorField(
      actionInActionSpace.paramSchema,
    );

    debug('locateFields', locateFields);

    locateFields.forEach((field) => {
      const locateResult = action.param?.[field];
      if (!locateResult) {
        return;
      }

      if (!includeLocateInPlanning) {
        if (typeof locateResult === 'object') {
          // In prompt-only planning mode, ignore any accidental coordinates from the model.
          action.param[field] = { prompt: locateResult.prompt };
        }
        return;
      }

      assert(
        locateResultAdapter,
        'planning locate normalization requires a locate result adapter',
      );
      action.param[field] = {
        ...locateResult,
        locatedPixelBbox: locateResultAdapter.adaptPlanningParamToPixelBbox(
          locateResult,
          locateResultContext,
        ),
      };
    });
  });
}
