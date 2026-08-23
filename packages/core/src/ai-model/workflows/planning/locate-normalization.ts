import { findAllMidsceneLocatorField } from '@/common';
import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type {
  LocateResultCodec,
  LocateResultContext,
} from '../../shared/model-locate-result/types';

const debug = getDebug('planning');

export function normalizePlanningActionLocateFields(
  actions: PlanningAction[],
  {
    actionSpace,
    includeLocateInPlanning,
    locateResultCodec,
    locateResultContext,
  }: {
    actionSpace: DeviceAction[];
    includeLocateInPlanning: boolean;
    locateResultCodec?: LocateResultCodec;
    locateResultContext: LocateResultContext;
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
        locateResultCodec,
        'planning locate normalization requires a locate result codec',
      );
      const rawLocateValue =
        typeof locateResult === 'object' && locateResult !== null
          ? (locateResult as Record<string, unknown>)[
              locateResultCodec.promptSpec.resultKey
            ]
          : locateResult;
      action.param[field] = {
        ...locateResult,
        locatedPixelBbox: locateResultCodec.toPixelBbox(
          rawLocateValue,
          locateResultContext,
        ),
      };
    });
  });
}
