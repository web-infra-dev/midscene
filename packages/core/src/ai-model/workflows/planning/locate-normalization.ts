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
    ...options
  }: PlanningLocateNormalizationOptions & {
    actionSpace: DeviceAction[];
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
      const locateParameter = action.param?.[field];
      if (!locateParameter) {
        return;
      }

      action.param[field] = normalizePlanningLocateParameter(
        locateParameter,
        options,
      );
    });
  });
}

export type PlanningLocateNormalizationOptions = {
  includeLocateInPlanning: boolean;
  locateResultCodec?: LocateResultCodec;
  locateResultContext: LocateResultContext;
  acceptBbox2dAlias?: boolean;
};

export function normalizePlanningLocateParameter(
  locateParameter: ParsedPlanningLocateParameter,
  {
    includeLocateInPlanning,
    locateResultCodec,
    locateResultContext,
    acceptBbox2dAlias = false,
  }: PlanningLocateNormalizationOptions,
): Record<string, unknown> {
  if (!includeLocateInPlanning) {
    // In prompt-only planning mode, ignore any accidental coordinates from the model.
    return { prompt: locateParameter.prompt };
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

  // The raw result field is replaced by locatedPixelResult, so it should not
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

  const result = locateResultCodec.toPixelResult(
    rawLocateValue,
    locateResultContext,
  );
  return {
    ...locateParamWithoutRawCoordinates,
    locatedPixelResult: result,
  };
}
