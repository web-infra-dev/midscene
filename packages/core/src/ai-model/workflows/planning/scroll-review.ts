import type { ActionScrollParam, ExecutionTask, ScrollState } from '@/types';

export interface ScrollReview {
  progress: 'unchanged';
  observation: string;
  nextSearchDirection: 'up' | 'down' | 'left' | 'right' | null;
}

function scrollDirection(param: Partial<ActionScrollParam> = {}): string {
  const boundaryDirections: Record<string, string> = {
    scrollToTop: 'up',
    scrollToBottom: 'down',
    scrollToLeft: 'left',
    scrollToRight: 'right',
  };
  return (
    boundaryDirections[param.scrollType ?? ''] || param.direction || 'down'
  );
}

/** Only movement along the requested axis/direction establishes progress. */
export function compareScrollStates(
  before: ScrollState | undefined,
  after: ScrollState | undefined,
  param: ActionScrollParam,
): 'moved' | 'unchanged' | 'uncertain' {
  if (!before || !after || before.targetId !== after.targetId)
    return 'uncertain';
  const direction = scrollDirection(param);
  const delta =
    direction === 'left' || direction === 'right'
      ? after.scrollLeft - before.scrollLeft
      : after.scrollTop - before.scrollTop;
  if (!Number.isFinite(delta)) return 'uncertain';
  if (Math.abs(delta) <= 0.5) return 'unchanged';
  return delta * (direction === 'up' || direction === 'left' ? -1 : 1) > 0
    ? 'moved'
    : 'uncertain';
}

/** Only fully measured, ordinary non-negative ranges constrain direction advice. */
function availableScrollDirections(state?: ScrollState): string[] | undefined {
  if (!state) return undefined;
  const {
    scrollLeft: x,
    scrollTop: y,
    maxScrollLeft: maxX,
    maxScrollTop: maxY,
  } = state;
  if (
    maxX === undefined ||
    maxY === undefined ||
    ![x, y, maxX, maxY].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    maxX < x ||
    maxY < y
  )
    return undefined;
  return [
    x > 0.5 ? 'left' : '',
    x < maxX - 0.5 ? 'right' : '',
    y > 0.5 ? 'up' : '',
    y < maxY - 0.5 ? 'down' : '',
  ].filter(Boolean);
}

function confirmedTarget(task: ExecutionTask): string | undefined {
  const evidence = task.scrollProgress;
  return evidence?.before?.targetId === evidence?.after?.targetId
    ? evidence?.before?.targetId
    : undefined;
}

const scrollReviewInterval = 3;

/** Only confirmed native stalls count toward the fixed three-action review. */
export function findScrollToReview(
  tasks: ExecutionTask[],
  reviewedTaskId?: string,
): ExecutionTask | undefined {
  const actions = tasks.filter((task) => task.type === 'Action Space');
  const last = actions.at(-1);
  const targetId = last && confirmedTarget(last);
  if (!last || !targetId) return undefined;
  let count = 0;
  for (let i = actions.length - 1; i >= 0; i--) {
    const task = actions[i];
    if (
      (reviewedTaskId !== undefined && task.taskId === reviewedTaskId) ||
      task.subType !== 'Scroll' ||
      task.status !== 'finished' ||
      task.scrollProgress?.status !== 'unchanged' ||
      scrollDirection(task.param) !== scrollDirection(last.param) ||
      confirmedTarget(task) !== targetId
    )
      break;
    count++;
  }
  return count >= scrollReviewInterval ? last : undefined;
}

export function nativeScrollReview(
  task: ExecutionTask,
): ScrollReview | undefined {
  if (task.scrollProgress?.status !== 'unchanged' || !confirmedTarget(task))
    return undefined;
  const state = task.scrollProgress.after;
  const available = availableScrollDirections(state);
  if (!state || !available) return undefined;
  const direction = scrollDirection(task.param);
  return {
    progress: 'unchanged',
    observation: `The target's own scroll offsets did not change. Native offsets are (${state.scrollLeft}, ${state.scrollTop}), with maximum offsets (${state.maxScrollLeft}, ${state.maxScrollTop}). Directions with remaining native range: ${available.join(', ') || 'none'}. ${available.includes(direction) ? 'The requested direction still has range; reassess the dispatch position or target instead of assuming a boundary.' : 'The requested direction has no remaining native range.'} Native range does not establish whether content has loaded or the task goal is present.`,
    nextSearchDirection:
      !available.includes(direction) && available.length === 1
        ? (available[0] as ScrollReview['nextSearchDirection'])
        : null,
  };
}

/** Fresh facts, supplied only while recovering the same measured container. */
export function scrollPlanningFeedback(
  task: ExecutionTask,
): string | undefined {
  const state = task.scrollProgress?.after;
  if (!state || !confirmedTarget(task)) return undefined;
  const available = availableScrollDirections(state);
  if (!available) return undefined;
  return `For the same scroll container ${state.targetId}, the latest executed scroll was ${scrollDirection(task.param)}. Current offsets: (${state.scrollLeft}, ${state.scrollTop}); maximum offsets: (${state.maxScrollLeft}, ${state.maxScrollTop}). Remaining native distances: ${JSON.stringify({ left: state.scrollLeft, right: state.maxScrollLeft! - state.scrollLeft, up: state.scrollTop, down: state.maxScrollTop! - state.scrollTop })}. Directions with remaining range: ${available.join(', ') || 'none'}. These current measurements supersede earlier assumptions about this container. For a goal-driven search, do not repeat a direction with no remaining range on this target; choose a supported direction or reassess the target/loading controls. Choose a search distance or boundary scroll appropriate to the remaining range rather than copying the previous small step. Explicit user directions, distances, counts and stop conditions take priority. No remaining range does not establish task completion or that the requested item is absent.`;
}

export function scrollReviewFeedback(review: ScrollReview): string {
  return `Review of the last scroll: ${review.observation}\n${review.nextSearchDirection ? `A candidate search direction is ${review.nextSearchDirection}. Verify it against the task and current UI before acting; the observation may be incomplete.` : 'Reassess the scroll target, dispatch position, and task-relevant controls. No alternative direction was established.'} For goal-driven searches, choose a distance appropriate to the remaining range instead of copying the stalled scroll distance. No movement or absent direction guidance does not establish that the target is absent or the task is complete. Explicit user direction and distance instructions take priority. This review describes observations, not an executed action.`;
}
