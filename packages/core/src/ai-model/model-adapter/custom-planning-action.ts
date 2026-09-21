import type { LocateResultPoint, PlanningAction } from '@/types';
import type { PixelLocateResult } from '../shared/model-locate-result';

// AutoGLM and UI-TARS both produce point coordinates before normalization.
type PreNormalizedPlanningLocateParam = {
  prompt: string;
  point: LocateResultPoint;
};

export type LocateActionParam = {
  locate: PreNormalizedPlanningLocateParam;
};

export type LocatePlanningAction<TType extends string> =
  PlanningAction<LocateActionParam> & {
    type: TType;
  };

export type ScrollPlanningAction = PlanningAction<
  LocateActionParam & {
    distance: number;
    direction: 'up' | 'down' | 'left' | 'right';
  }
> & {
  type: 'Scroll';
};

export type DragAndDropPlanningAction = PlanningAction<{
  from: PreNormalizedPlanningLocateParam;
  to: PreNormalizedPlanningLocateParam;
}> & {
  type: 'DragAndDrop';
};

type TapPlanningActionWithLocatedPixelResult = PlanningAction<{
  locate: {
    locatedPixelResult: PixelLocateResult;
  };
}>;

export function getTapLocatedPixelResult(
  actions: PlanningAction[],
): PixelLocateResult | undefined {
  for (const action of actions) {
    if (action.type !== 'Tap') {
      continue;
    }

    return (action as TapPlanningActionWithLocatedPixelResult).param.locate
      .locatedPixelResult;
  }

  return undefined;
}
