import type { ScreenshotItem } from '@/screenshot-item';
import type { ExecutionTask, PlanningAction, UIContext } from '@/types';
import { imageDifference } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';

const debug = getDebug('agent:plan-freshness');

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

/** Evaluate the recorded post-plan observation and retain the decision for diagnostics. */
export async function evaluatePlanFreshness(
  task: ExecutionTask,
  actions: PlanningAction[],
  executionId: string,
  planIndex: number,
) {
  if (actions.find((action) => action.type !== 'Locate')?.type !== 'Tap')
    return;
  const currentScreenshot = task.recorder?.findLast(
    (item) => item.type === 'screenshot' && item.timing === 'after-calling',
  )?.screenshot;
  if (!task.uiContext || !currentScreenshot) {
    throw new Error(
      'Screen freshness requires planning and post-planning screenshots',
    );
  }
  const result = await checkPlanFreshness(
    actions,
    task.uiContext,
    currentScreenshot,
  );
  if (!result) return;
  const decision = {
    executionId,
    taskId: task.taskId,
    planIndex,
    planningScreenshotId: task.uiContext.screenshot.id,
    currentScreenshotId: currentScreenshot.id,
    planningCapturedAt: task.uiContext.screenshot.capturedAt,
    currentCapturedAt: currentScreenshot.capturedAt,
    ...result,
    decision: result.changed ? 'replan' : 'execute',
  };
  debug('plan freshness %o', decision);
  task.log = { ...task.log, planFreshness: decision };
  return result;
}
