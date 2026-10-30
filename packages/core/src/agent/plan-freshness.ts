import type { ScreenshotItem } from '@/screenshot-item';
import type { PlanningAction, UIContext } from '@/types';
import { imageDifference } from '@midscene/shared/img';

/** Visual heuristic, not a semantic assertion that an action is still valid. */
export async function checkPlanFreshness(
  actions: PlanningAction[],
  context: UIContext,
  current: ScreenshotItem,
) {
  // Validate before the first action; subsequent actions may change the screen.
  const first = actions.find((action) => action.type !== 'Locate');
  if (first?.type !== 'Tap') return;
  const difference = await imageDifference(
    context.screenshot.base64,
    current.base64,
  );
  // An absolute count keeps small menu changes detectable on large screens.
  // Clocks, carets and animations can still trigger this visual heuristic.
  return {
    ...difference,
    changed: difference.dimensionsChanged || difference.changedPixels >= 16,
  };
}
