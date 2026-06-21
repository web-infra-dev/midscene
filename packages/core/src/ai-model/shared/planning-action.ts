import type { PlanningAction, PlanningLocateParam } from '@/types';

export type LocateActionParam = {
  locate: PlanningLocateParam;
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
  from: PlanningLocateParam;
  to: PlanningLocateParam;
}> & {
  type: 'DragAndDrop';
};
