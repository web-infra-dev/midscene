import type { AbstractInterface, ScrollGeometry } from '@/device';
import type { ExecutionTask, UIContext } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import {
  relativeScrollTravel,
  scrollGeometryFeedback,
} from './scroll-geometry';

function isScrollGesture(task: ExecutionTask) {
  return task.subType === 'Scroll' || task.subType === 'Swipe';
}

/** Observe a native container after repeated scroll gestures leave the view unchanged. */
export class ScrollGeometryObserver {
  private previous?: UIContext;
  private actionCount = 0;
  private unchangedGestures = 0;
  private reference?: ScrollGeometry;
  private pausedFrame?: string;
  private unavailable = false;

  constructor(
    private readonly capture: NonNullable<
      AbstractInterface['captureScrollGeometry']
    >,
  ) {}

  async feedback(
    tasks: ExecutionTask[],
    context: UIContext,
  ): Promise<string | undefined> {
    if (this.unavailable) return;
    const actions = tasks.filter((task) => task.type === 'Action Space');
    const last = actions.at(-1);
    const previous = this.previous;
    const sameFrame =
      previous?.screenshot.base64 === context.screenshot.base64 &&
      previous?.shotSize.width === context.shotSize.width &&
      previous?.shotSize.height === context.shotSize.height;
    this.previous = context;
    const added = actions.length - this.actionCount;
    this.actionCount = actions.length;
    if (!added && sameFrame) return;
    if (!sameFrame) this.pausedFrame = undefined;
    if (
      added !== 1 ||
      last?.status !== 'finished' ||
      last.timing?.callActionEnd === undefined ||
      context.screenshot.capturedAt <= last.timing.callActionEnd ||
      !isScrollGesture(last)
    ) {
      this.reference = undefined;
      this.unchangedGestures = 0;
      return;
    }
    this.unchangedGestures = sameFrame ? this.unchangedGestures + 1 : 0;
    if (
      !this.reference &&
      (this.unchangedGestures < 2 ||
        actions.length < 3 ||
        !actions
          .slice(-3)
          .every((task) => task.status === 'finished' && isScrollGesture(task)))
    )
      return;
    if (this.pausedFrame === context.screenshot.base64) return;
    try {
      const geometry = await this.capture();
      if (!geometry) {
        this.reference = undefined;
        this.pausedFrame = context.screenshot.base64;
        return;
      }
      if (!this.reference || !relativeScrollTravel(geometry, this.reference))
        this.reference = geometry;
      // Identical frames already have a fresh observation. Resume sampling when the view changes.
      this.pausedFrame = context.screenshot.base64;
      return scrollGeometryFeedback(geometry, this.reference);
    } catch (error) {
      this.unavailable = true;
      getDebug('agent:scroll-geometry', { console: true })(
        'Native geometry query failed',
        error,
      );
    }
  }
}
