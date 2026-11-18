import {
  type ScrollReview,
  findScrollToReview,
  nativeScrollReview,
  scrollPlanningFeedback,
} from '@/ai-model/workflows/planning/scroll-review';
import type { ExecutionSession } from './execution-session';

/** Per-aiAct review state and report lifecycle; never executes a UI action. */
export class ScrollRecovery {
  private reviewedTaskId?: string;
  private recoveringTargetId?: string;

  constructor(private readonly session: ExecutionSession) {}

  /** Keep measured state fresh until the action or target changes. */
  planningFeedback(): string | undefined {
    if (!this.recoveringTargetId) return undefined;
    const task = this.session
      .getRunner()
      .tasks.filter((t) => t.type === 'Action Space')
      .at(-1);
    if (
      task?.subType === 'Scroll' &&
      task.status === 'finished' &&
      task.scrollProgress?.after?.targetId === this.recoveringTargetId
    ) {
      const feedback = scrollPlanningFeedback(task);
      if (feedback) return feedback;
    }
    this.recoveringTargetId = undefined;
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
    this.recoveringTargetId = task.scrollProgress?.after?.targetId;
    return observation;
  }
}
