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

      const resultKey = locateResultCodec.promptSpec.resultKey;
      const rawLocateValue =
        locateParameter[resultKey] !== undefined
          ? locateParameter[resultKey]
          : acceptBbox2dAlias && resultKey === 'bbox'
            ? locateParameter.bbox_2d
            : undefined;

      // The raw result field is replaced by locatedPixelBbox, so it should not
      // remain in the normalized locate parameter.
      const rawCoordinateKeys = new Set([
        resultKey,
        ...(acceptBbox2dAlias && resultKey === 'bbox' ? ['bbox_2d'] : []),
      ]);

      const locateParamWithoutRawCoordinates = Object.fromEntries(
        Object.entries(locateParameter).filter(
          ([key]) => !rawCoordinateKeys.has(key),
        ),
      );

      action.param[field] = {
        ...locateParamWithoutRawCoordinates,
        locatedPixelBbox: locateResultCodec.toPixelBbox(
          rawLocateValue,
          locateResultContext,
        ),
      };
    });
  });
}
