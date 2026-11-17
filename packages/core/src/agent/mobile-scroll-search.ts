import type { AbstractInterface, ScrollGeometry } from '@/device';
import type { ActionScrollParam, ExecutionTask, UIContext } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import {
  relativeScrollTravel,
  scrollGeometryFeedback,
} from './scroll-geometry';

type Direction = 'up' | 'down' | 'left' | 'right';

const exhaustedGeometryAdvice =
  'Native layout did not establish progress during three further probes. Reassess the target instead of continuing blind probes; verify the original goal before finishing.';

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

/** Per-aiAct recovery advice from captured frames and optional native geometry. */
export class MobileScrollSearch {
  private geometry?: ScrollGeometry;
  private lastGeometry?: ScrollGeometry;
  private idleGeometry = 0;
  private geometryUnavailable = false;
  private exhaustedFrame?: string;
  private frame?: string;
  private width?: number;
  private height?: number;
  private lastActionId?: string;
  private direction?: string;
  private unchanged = 0;
  private failed = new Set<string>();
  private probes = 0;
  private continuingDirection?: string;

  async planningFeedbackWithGeometry(
    tasks: ExecutionTask[],
    context: UIContext,
    capture?: AbstractInterface['captureScrollGeometry'],
  ): Promise<string | undefined> {
    const previousAction = this.lastActionId;
    const feedback = this.planningFeedback(tasks, context);
    if (!capture || this.geometryUnavailable) return feedback;
    const actions = tasks.filter((task) => task.type === 'Action Space');
    const last = actions.at(-1);
    const previousIndex = previousAction
      ? actions.findIndex((task) => task.taskId === previousAction)
      : -1;
    const fresh =
      actions.length - previousIndex === 2 &&
      last?.status === 'finished' &&
      last.timing?.callActionEnd !== undefined &&
      context.screenshot.capturedAt > last.timing.callActionEnd;
    if (!fresh) {
      if (last?.taskId === previousAction) return feedback;
      this.geometry = this.lastGeometry = undefined;
      this.idleGeometry = 0;
      return feedback;
    }
    if (!this.geometry && !searchDirection(last)) return feedback;
    if (this.exhaustedFrame === context.screenshot.base64)
      return exhaustedGeometryAdvice;
    // Two repeated frames after at least three gestures tolerate the first touch
    // changing system chrome, without changing the pixel-only search threshold.
    if (
      !this.geometry &&
      (this.unchanged < 2 ||
        actions.length < 3 ||
        !actions
          .slice(-3)
          .every(
            (task) => task.status === 'finished' && !!searchDirection(task),
          ))
    )
      return feedback;
    let geometry: ScrollGeometry | undefined;
    try {
      geometry = await capture();
    } catch (error) {
      this.geometryUnavailable = true;
      getDebug('agent:mobile-scroll-search', { console: true })(
        'Native geometry unavailable; retaining screenshot-only recovery',
        error,
      );
      return feedback;
    }
    if (!geometry) {
      this.geometry = this.lastGeometry = undefined;
      this.idleGeometry = 0;
      return feedback;
    }
    const travel =
      this.lastGeometry && relativeScrollTravel(geometry, this.lastGeometry);
    const newTarget =
      !this.lastGeometry ||
      geometry.targetId !== this.lastGeometry.targetId ||
      JSON.stringify(geometry.viewport) !==
        JSON.stringify(this.lastGeometry.viewport);
    this.idleGeometry =
      newTarget || (travel && (travel.x !== 0 || travel.y !== 0))
        ? 0
        : this.idleGeometry + 1;
    // Reset the reference on target replacement, resize, or incompatible layout.
    if (
      !this.geometry ||
      relativeScrollTravel(geometry, this.geometry) === undefined
    )
      this.geometry = geometry;
    this.lastGeometry = geometry;
    if (this.idleGeometry >= 3) {
      this.exhaustedFrame = context.screenshot.base64;
      this.geometry = this.lastGeometry = undefined;
      this.idleGeometry = 0;
      return exhaustedGeometryAdvice;
    }
    return [feedback, scrollGeometryFeedback(geometry, this.geometry)]
      .filter(Boolean)
      .join('\n');
  }

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
