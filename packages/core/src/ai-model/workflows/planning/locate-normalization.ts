import { findAllMidsceneLocatorField } from '@/common';
import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ParsedPlanningLocateParameter } from '../../model-adapter/planning-protocol';
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
    acceptBbox2dAlias = false,
    parseRawLocateParameter,
  }: {
    actionSpace: DeviceAction[];
    includeLocateInPlanning: boolean;
    locateResultCodec?: LocateResultCodec;
    locateResultContext: LocateResultContext;
    acceptBbox2dAlias?: boolean;
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
        locateResultCodec,
        'planning locate normalization requires a locate result codec',
      );
      const rawLocateValue = (() => {
        if (typeof locateParameter !== 'object' || locateParameter === null) {
          return locateParameter;
        }

        const locateResultRecord = locateParameter as Record<string, unknown>;
        const resultKey = locateResultCodec.promptSpec.resultKey;
        if (locateResultRecord[resultKey] !== undefined) {
          return locateResultRecord[resultKey];
        }

        return acceptBbox2dAlias && resultKey === 'bbox'
          ? locateResultRecord.bbox_2d
          : undefined;
      })();
      action.param[field] = {
        ...locateParameter,
        locatedPixelBbox: locateResultCodec.toPixelBbox(
          rawLocateValue,
          locateResultContext,
        ),
      };
    });
  });
}
