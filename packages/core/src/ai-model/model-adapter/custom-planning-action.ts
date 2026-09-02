import type { LocateResultPoint, PixelBbox, PlanningAction } from '@/types';

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

type TapPlanningActionWithLocatedPixelBbox = PlanningAction<{
  locate: {
    locatedPixelBbox: PixelBbox;
  };
}>;

export function getTapLocatedPixelBbox(
  actions: PlanningAction[],
): PixelBbox | undefined {
  for (const action of actions) {
    if (action.type !== 'Tap') {
      continue;
    }

    return (action as TapPlanningActionWithLocatedPixelBbox).param.locate
      .locatedPixelBbox;
  }

  return undefined;
}
