import type { ModelRuntime } from '@/ai-model/models';
import { AIResponseParseError } from '@/ai-model/service-caller';
import {
  DEFAULT_SCROLL_REVIEW_INTERVAL,
  type ScrollReview,
  findScrollToReview,
  reviewScroll,
} from '@/ai-model/workflows/planning/scroll-review';
import { assert } from '@midscene/shared/utils';
import type { ExecutionSession } from './execution-session';
import { withUsageIntent } from './usage-intent';

export type ScrollRecoveryOptions =
  | boolean
  | {
      /** Review after this many consecutive same-direction scrolls. Integer >= 2; default 3. */
      afterScrolls?: number;
    };

export function resolveScrollRecoveryInterval(
  options?: ScrollRecoveryOptions,
): number | undefined {
  if (!options) return undefined;
  const interval =
    typeof options === 'boolean'
      ? DEFAULT_SCROLL_REVIEW_INTERVAL
      : (options.afterScrolls ?? DEFAULT_SCROLL_REVIEW_INTERVAL);
  if (!Number.isSafeInteger(interval) || interval < 2)
    throw new Error(
      'scrollRecovery.afterScrolls must be a safe integer greater than or equal to 2',
    );
  return interval;
}

/** Per-aiAct review state and report lifecycle; never executes a UI action. */
export class ScrollRecovery {
  private reviewedTaskId?: string;

  constructor(
    private readonly session: ExecutionSession,
    private readonly model: ModelRuntime,
    private readonly afterScrolls: number,
  ) {
    if (
      model.adapter.planning.kind !== 'standard' ||
      model.config.protocol === 'openai-responses'
    ) {
      throw new Error(
        'scrollRecovery requires a standard planner using openai-chat',
      );
    }
  }

  async review(
    onStart: () => Promise<void>,
    abortSignal?: AbortSignal,
  ): Promise<ScrollReview | undefined> {
    const task = findScrollToReview(
      this.session.getRunner().tasks,
      this.afterScrolls,
      this.reviewedTaskId,
    );
    if (!task) return undefined;
    this.reviewedTaskId = task.taskId;
    await onStart();
    let observation: ScrollReview | undefined;
    await this.session.appendAndRun({
      type: 'Planning',
      subType: 'ScrollReview',
      param: { scroll: task.param },
      executor: async (context) => {
        assert(
          context.uiContext,
          'Scroll review requires the current screenshot',
        );
        try {
          const result = await reviewScroll({
            task,
            current: context.uiContext,
            modelRuntime: this.model,
            abortSignal,
          });
          observation = result.content;
          context.task.usage = withUsageIntent(result.usage, 'planning');
          return {
            output: observation,
            log: {
              rawResponse: result.contentString,
              rawAssistantOutput: result.rawAssistantOutput,
            },
          };
        } catch (error) {
          if (error instanceof AIResponseParseError) {
            context.task.usage = withUsageIntent(error.usage, 'planning');
            context.task.log = {
              rawResponse: error.rawResponse,
              rawAssistantOutput: error.rawAssistantOutput,
            };
          }
          throw error;
        }
      },
    });
    assert(observation, 'Scroll review completed without an observation');
    return observation;
  }
}
