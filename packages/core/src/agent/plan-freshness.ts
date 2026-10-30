import type { ScreenshotItem } from '@/screenshot-item';
import type { DetailedLocateParam, PlanningAction, UIContext } from '@/types';
import { imageRegionDifference } from '@midscene/shared/img';
import { ifLocateParamHasLocatedPixelResult } from './utils';

/** Visual heuristic, not a semantic assertion that an action is still valid. */
export async function checkPlanFreshness(
  actions: PlanningAction[],
  context: UIContext,
  current: ScreenshotItem,
): Promise<{ changed: boolean; difference: number } | undefined> {
  // Later actions can intentionally change the first target. Only validate the
  // initial tap, before any side effect from this planning batch has run.
  const first = actions.find((action) => action.type !== 'Locate');
  if (first?.type !== 'Tap') return;
  const locator = first.param?.locate as DetailedLocateParam | undefined;
  if (!locator || !ifLocateParamHasLocatedPixelResult(locator)) return;
  const pixel = locator.locatedPixelResult;
  if (!pixel) return; // A separate locate step will ground prompt-only plans.
  const rect = pixel.rect ?? {
    left: pixel.center[0] - 16,
    top: pixel.center[1] - 16,
    width: 32,
    height: 32,
  };
  // Planning coordinates are already in screenshot pixels, not logical pixels.
  // Text-only boxes often omit an adjacent disclosure arrow. Include a small
  // horizontal neighborhood without pulling in the next navigation row.
  const horizontalPadding = 32;
  const verticalPadding = 8;
  const difference = await imageRegionDifference(
    context.screenshot.base64,
    current.base64,
    {
      left: rect.left - horizontalPadding,
      top: rect.top - verticalPadding,
      width: rect.width + horizontalPadding * 2,
      height: rect.height + verticalPadding * 2,
    },
  );
  // Ignore isolated pixel noise, but keep small expand/collapse arrows visible
  // to the guard. Animations inside the target can still require replanning.
  return { changed: difference > 0.005, difference };
}
