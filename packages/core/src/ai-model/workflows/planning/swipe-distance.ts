import type { PlanningAction } from '@/types';

/** Normalize model-produced screenshot distances before execution and YAML export.
 * Explicit Agent/device calls and replayed YAML already use logical distances.
 */
export function normalizePlanningSwipeDistances(
  actions: PlanningAction[],
  screenshotToLogicalRatio: number,
): void {
  for (const action of actions) {
    if (action.type !== 'Swipe' || action.param?.distance === undefined) {
      continue;
    }
    if (
      !Number.isFinite(screenshotToLogicalRatio) ||
      screenshotToLogicalRatio <= 0
    ) {
      throw new Error('Invalid screenshot-to-logical ratio for planned Swipe');
    }
    action.param = {
      ...action.param,
      distance: action.param.distance / screenshotToLogicalRatio,
    };
  }
}
