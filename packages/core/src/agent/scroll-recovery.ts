import {
  type ScrollReview,
  findScrollToReview,
  nativeScrollReview,
  scrollPlanningFeedback,
} from '@/ai-model/workflows/planning/scroll-review';
import type { UIContext } from '@/types';
import type { ExecutionSession } from './execution-session';

/** Per-aiAct review state and report lifecycle; never executes a UI action. */
export class ScrollRecovery {
  private reviewedTaskId?: string;
  private recoveringTarget?: { id: string; hasSearchDirection: boolean };

  constructor(private readonly session: ExecutionSession) {}

  /** Keep measured state fresh until the action or target changes. */
  planningFeedback(
    view: Pick<UIContext, 'shotSize' | 'shrunkShotToLogicalRatio'>,
  ): string | undefined {
    if (!this.recoveringTarget) return undefined;
    const task = this.session
      .getRunner()
      .tasks.filter((t) => t.type === 'Action Space')
      .at(-1);
    if (
      task?.subType === 'Scroll' &&
      task.status === 'finished' &&
      task.scrollProgress?.after?.targetId === this.recoveringTarget.id
    ) {
      const feedback = scrollPlanningFeedback(
        task,
        this.recoveringTarget.hasSearchDirection,
        view,
      );
      if (feedback) return feedback;
    }
    this.recoveringTarget = undefined;
    return undefined;
  }

  async review(
    onStart: () => Promise<void>,
    abortSignal?: AbortSignal,
  ): Promise<ScrollReview | undefined> {
    abortSignal?.throwIfAborted();
    const task = findScrollToReview(
      this.session.getRunner().tasks,
      this.reviewedTaskId,
    );
    const observation = task && nativeScrollReview(task);
    if (!task || !observation) return undefined;
    this.reviewedTaskId = task.taskId;
    await onStart();
    abortSignal?.throwIfAborted();
    await this.session.appendAndRun({
      type: 'Planning',
      subType: 'ScrollReview',
      param: { scroll: task.param, progressEvidence: task.scrollProgress },
      executor: async () => ({ output: observation }),
    });
    const id = task.scrollProgress?.after?.targetId;
    this.recoveringTarget = id
      ? { id, hasSearchDirection: observation.nextSearchDirection !== null }
      : undefined;
    return observation;
  }
}
