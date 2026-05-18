import { getStandardLocateResultAdapter } from '@/ai-model/models';
import { adaptLocateResultToPixelBbox } from '@/ai-model/shared/model-locate-result/adapt';
import type { PlanningLocateParam } from '@/types';
import type { TModelFamily } from '@midscene/shared/env';
import { assert } from '@midscene/shared/utils';

export function normalizePlanningLocateParam(
  locate: PlanningLocateParam,
  options: {
    width: number;
    height: number;
    bounds?: {
      width: number;
      height: number;
    };
    modelFamily?: TModelFamily;
  },
): PlanningLocateParam {
  const resultAdapter = getStandardLocateResultAdapter(options.modelFamily);
  const rawResult = resultAdapter.extractRawLocateResult(locate);
  assert(
    rawResult !== undefined,
    'planning locate param does not contain a recognizable locate result field',
  );

  // `extractRawLocateResult` handles compatibility fields such as
  // `bbox_2d`. This function only writes the normalized canonical `bbox` field
  // and intentionally keeps the original model-output fields untouched.
  return {
    ...locate,
    bbox: adaptLocateResultToPixelBbox(rawResult, {
      width: options.width,
      height: options.height,
      bounds: options.bounds,
      modelFamily: options.modelFamily,
    }),
  };
}
