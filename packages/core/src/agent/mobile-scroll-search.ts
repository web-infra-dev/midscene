import type { ActionScrollParam, ExecutionTask, UIContext } from '@/types';

type Direction = 'up' | 'down' | 'left' | 'right';

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

function searchDirection(task?: ExecutionTask): string | undefined {
  if (task?.subType === 'Scroll') return scrollDirection(task.param);
  if (
    task?.subType !== 'Swipe' ||
    (task.param?.repeat !== undefined && task.param.repeat !== 1)
  )
    return undefined;
  if (task.param?.end) {
    const from = task.param.start?.center;
    const to = task.param.end?.center;
    if (!from || !to || ![...from, ...to].every(Number.isFinite))
      return undefined;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    if (dy === 0 && dx !== 0) return dx > 0 ? 'left' : 'right';
    if (dx === 0 && dy !== 0) return dy > 0 ? 'up' : 'down';
    return undefined;
  }
  // Relative Swipe names finger motion; Scroll names the content search direction.
  return ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[
    task.param?.direction as Direction
  ];
}

/** Per-aiAct search advice based only on identical, already captured frames. */
export class MobileScrollSearch {
  private frame?: string;
  private width?: number;
  private height?: number;
  private lastActionId?: string;
  private direction?: string;
  private unchanged = 0;
  private failed = new Set<string>();
  private probes = 0;
  private continuingDirection?: string;

  private resetSearch() {
    this.direction = undefined;
    this.unchanged = 0;
    this.failed.clear();
    this.probes = 0;
    this.continuingDirection = undefined;
  }

  planningFeedback(
    tasks: ExecutionTask[],
    context: UIContext,
  ): string | undefined {
    const actions = tasks.filter((task) => task.type === 'Action Space');
    const last = actions.at(-1);
    const image = context.screenshot.base64;
    const comparable =
      this.frame !== undefined &&
      this.width === context.shotSize.width &&
      this.height === context.shotSize.height;
    const sameFrame = comparable && this.frame === image;
    this.frame = image;
    this.width = context.shotSize.width;
    this.height = context.shotSize.height;
    if (last?.taskId === this.lastActionId) {
      if (!sameFrame) this.resetSearch();
      return this.continuingDirection
        ? this.continuationFeedback()
        : this.unchanged >= 3
          ? this.feedback()
          : undefined;
    }
    const previousIndex = this.lastActionId
      ? actions.findIndex((task) => task.taskId === this.lastActionId)
      : -1;
    this.lastActionId = last?.taskId;
    const direction = searchDirection(last);
    const freshSingleAction =
      actions.length - previousIndex === 2 &&
      last?.status === 'finished' &&
      last.timing?.callActionEnd !== undefined &&
      context.screenshot.capturedAt > last.timing.callActionEnd;
    // An inert tap does not invalidate a direction that exposed new content.
    if (
      freshSingleAction &&
      sameFrame &&
      last?.subType === 'Tap' &&
      this.continuingDirection
    ) {
      if (++this.probes < 3)
        return `${this.continuationFeedback()} The latest tap left the screenshot unchanged; recheck its target before repeating it.`;
      this.continuingDirection = undefined;
      this.unchanged = 3;
      return this.feedback();
    }
    // Batched actions cannot attribute an unchanged frame to one scroll.
    if (!comparable || !freshSingleAction || !direction) {
      this.resetSearch();
      return undefined;
    }
    if (!sameFrame) {
      const wasSearching = this.unchanged >= 3 || !!this.continuingDirection;
      this.resetSearch();
      if (!wasSearching) return undefined;
      this.continuingDirection = direction;
      return this.continuationFeedback();
    }
    if (this.continuingDirection && direction !== this.continuingDirection) {
      this.failed.add(direction);
      if (++this.probes < 3) return this.continuationFeedback();
      this.continuingDirection = undefined;
      this.unchanged = 3;
      return this.feedback();
    }
    this.continuingDirection = undefined;
    this.failed.add(direction);
    this.unchanged++;
    if (this.unchanged > 3) {
      this.probes++;
    } else {
      this.direction = direction;
      if (this.unchanged < 3) return undefined;
    }
    return this.feedback();
  }

  private continuationFeedback(): string {
    return `The most recent scroll that changed the screen was ${this.continuingDirection}. ${this.failed.size ? `Subsequent scrolls in ${[...this.failed].join(', ')} did not change this view.` : 'The earlier no-change direction list applies to the previous view, not this new view.'} Inspect the new content for the original goal. If further scrolling is needed, consider continuing ${this.continuingDirection} using Scroll and its platform-default distance rather than immediately reversing just to try another direction. Reassess if new UI evidence or the goal calls for a different direction. A changed screenshot does not prove native movement or task completion. Explicit user directions, distances, counts and stop conditions take priority.`;
  }

  private feedback(): string {
    const order: Direction[] =
      this.direction === 'left' || this.direction === 'right'
        ? ['down', 'up', 'right', 'left']
        : ['right', 'left', 'up', 'down'];
    const untested = order.filter((candidate) => !this.failed.has(candidate));
    const evidence = `Successive planning screenshots are exactly identical after completed search actions. Scroll directions tried without a visible screen change: ${[...this.failed].join(', ') || 'none on this view'}. This is whole-screen image evidence, not a measured container boundary or proof that content is absent.`;
    const advice =
      this.probes >= 3 || !untested.length
        ? 'The three-probe search budget is exhausted. Do not continue blind scroll probes on this unchanged screen; reassess the scroll target, loading state or navigation controls. Do not claim task completion without verifying the requested result.'
        : `For a goal-driven search, reassess the target and try this next exploratory candidate: Scroll with direction "${untested[0]}" and scrollType "singleAction". Use the platform-default distance unless the user specified one. Scroll directions describe where to search for content; Swipe directions describe finger motion, so use Scroll for this probe. Prefer the other axis before reversing on the stalled axis. Candidate directions in order: ${untested.join(', ')}. Do not repeat a failed direction or use a scroll-to-boundary loop as a probe. Make at most one probe per plan. At most ${3 - this.probes} further probes remain; inspect the next screenshot before choosing another action.`;
    return `${evidence} ${advice} Explicit user directions, distances, counts and stop conditions take priority over this search advice. A visible change ends this search advice; it does not establish task success.`;
  }
}
