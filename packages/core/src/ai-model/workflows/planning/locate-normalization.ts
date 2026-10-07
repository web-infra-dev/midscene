import { findAllMidsceneLocatorField } from '@/common';
import type { DeviceAction } from '@/device';
import type { PlanningAction } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { ParsedPlanningLocateParameter } from '../../model-adapter/planning-protocol';
import {
  locateResultKeys,
  readLocateResultField,
} from '../../shared/model-locate-result/result-field';
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
};

export function normalizePlanningLocateParameter(
  locateParameter: ParsedPlanningLocateParameter,
  {
    includeLocateInPlanning,
    locateResultCodec,
    locateResultContext,
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

  const { promptSpec } = locateResultCodec;
  const rawLocateValue = readLocateResultField(locateParameter, promptSpec);

  // Remove primary and alias fields after converting the raw coordinates.
  const rawCoordinateKeys = new Set(locateResultKeys(promptSpec));

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
