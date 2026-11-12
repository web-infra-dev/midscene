import type {
  ActionScrollParam,
  ExecutionTask,
  ScrollState,
  UIContext,
} from '@/types';
import { z } from 'zod';
import { prepareModelImage } from '../../model-adapter/image-preprocess';
import type { ModelRuntime } from '../../models';
import { callAIWithObjectResponse } from '../../service-caller';

const scrollReviewSchema = z.object({
  progress: z.enum(['moved', 'unchanged', 'uncertain']),
  observation: z.string().min(1),
  nextSearchDirection: z.enum(['up', 'down', 'left', 'right']).nullable(),
});

export type ScrollReview = z.infer<typeof scrollReviewSchema>;
const measuredStallReviewSchema = scrollReviewSchema
  .omit({ progress: true })
  .extend({ progress: z.literal('unchanged').optional() });

function scrollDirection(task: ExecutionTask): string {
  const boundaryDirections: Record<string, string> = {
    scrollToTop: 'up',
    scrollToBottom: 'down',
    scrollToLeft: 'left',
    scrollToRight: 'right',
  };
  return (
    boundaryDirections[task.param?.scrollType] ||
    task.param?.direction ||
    'down'
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
  const direction = scrollDirection({ param } as ExecutionTask);
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

function confirmedTarget(task: ExecutionTask): string | undefined {
  const evidence = task.scrollProgress;
  return evidence?.before?.targetId === evidence?.after?.targetId
    ? evidence?.before?.targetId
    : undefined;
}

/** Compare dispatch targets conservatively; coordinates are not container identity. */
function sameScrollTarget(a: ExecutionTask, b: ExecutionTask): boolean {
  const aId = confirmedTarget(a);
  const bId = confirmedTarget(b);
  if (a.scrollProgress || b.scrollProgress) {
    // Unknown or replaced containers cannot share a measured streak.
    if (aId || bId) return !!aId && aId === bId;
    if (
      a.scrollProgress?.before ||
      a.scrollProgress?.after ||
      b.scrollProgress?.before ||
      b.scrollProgress?.after
    )
      return a === b;
  }
  const left = a.param?.locate;
  const right = b.param?.locate;
  if (!left || !right) return !left && !right;
  if (!left.center || !right.center) return a === b;
  return (
    left.description === right.description &&
    left.center[0] === right.center[0] &&
    left.center[1] === right.center[1]
  );
}

export const DEFAULT_SCROLL_REVIEW_INTERVAL = 3;

/** Review at the configured cadence of consecutive same-direction scrolls. */
export function findScrollToReview(
  tasks: ExecutionTask[],
  afterScrolls = DEFAULT_SCROLL_REVIEW_INTERVAL,
  reviewedTaskId?: string,
): ExecutionTask | undefined {
  const actions = tasks.filter((task) => task.type === 'Action Space');
  const last = actions.at(-1);
  if (
    !last?.uiContext ||
    last.subType !== 'Scroll' ||
    last.status !== 'finished'
  )
    return undefined;
  let count = 0;
  for (let i = actions.length - 1; i >= 0; i--) {
    const task = actions[i];
    if (
      (reviewedTaskId !== undefined && task.taskId === reviewedTaskId) ||
      task.subType !== 'Scroll' ||
      task.status !== 'finished' ||
      task.scrollProgress?.status === 'moved' ||
      scrollDirection(task) !== scrollDirection(last) ||
      !sameScrollTarget(task, last)
    )
      break;
    count++;
  }
  return count >= afterScrolls ? last : undefined;
}

/** A separate observation avoids anchoring on the previous planner's guesses. */
export async function reviewScroll(options: {
  task: ExecutionTask;
  current: UIContext;
  modelRuntime: ModelRuntime;
  abortSignal?: AbortSignal;
}) {
  const { task, current, modelRuntime, abortSignal } = options;
  if (!task.uiContext)
    throw new Error('Scroll review requires a before-action screenshot');
  const images = await Promise.all(
    [task.uiContext, current].map((context) =>
      prepareModelImage({
        imageBase64: context.screenshot.base64,
        width: context.shotSize.width,
        height: context.shotSize.height,
        policy: modelRuntime.adapter.imagePreprocess,
      }),
    ),
  );
  const direction = scrollDirection(task);
  const measuredStall = task.scrollProgress?.status === 'unchanged';
  const result = await callAIWithObjectResponse(
    [
      {
        role: 'system',
        content:
          'Inspect a screenshot for scrollable regions and off-screen controls. Describe observed evidence rather than assuming a missing button is below.',
      },
      {
        role: 'user',
        content: [
          ...(task.scrollProgress
            ? [
                {
                  type: 'text' as const,
                  text: `Execution evidence for the target container (not the outer page): ${JSON.stringify(task.scrollProgress)}. Its own offset is separate from ancestor movement. Use the screenshots to inspect available overflow; treat replaced or unidentified targets as uncertain.`,
                },
              ]
            : []),
          ...(task.param?.locate
            ? [
                {
                  type: 'text' as const,
                  text: `Executed scroll target (device coordinates): ${JSON.stringify({ center: task.param.locate.center, rect: task.param.locate.rect })}. This identifies where the scroll was dispatched, not the full bounds of its scrollable container. Compare content inside its enclosing scrollable region, including nested content. Movement of an unrelated outer page is not evidence that this target moved.`,
                },
              ]
            : []),
          {
            type: 'text',
            text: measuredStall
              ? `The last action was Scroll ${direction}. Execution evidence establishes that this target's own scroll offset did not change. Do not reclassify ancestor displacement as target scrolling. Inspect the screenshots only for visible scrollbar orientations and clipped edges, including the viewport edges. Which other direction has visible overflow for an off-screen search? Do not assume a missing footer button is below. Return JSON with observation (describe the visible overflow evidence) and nextSearchDirection ("up", "down", "left", "right", or null). Suggest a different direction only when supported by visible overflow; otherwise use null. Do not issue actions or infer task completion.`
              : `The last action was Scroll ${direction}. Compare the before and after screenshots. Describe whether the scrolled content moved and all visible scrollbar orientations and clipped edges, including the entire viewport edges. Which direction has unexplored content for finding the requested off-screen control? Do not assume a missing footer button is below. If the scrolled region moved along the requested axis, report that progress without suggesting a different direction. Only when it did not move should you suggest another direction supported by visible overflow. Return JSON with progress ("moved", "unchanged", or "uncertain") observation (a brief description), and nextSearchDirection ("up", "down", "left", "right", or null). When unchanged, choose a different search direction supported by the visible scrollbar or clipped edge; use null if no alternative is supported. When moved or uncertain, use null. Do not issue actions.`,
          },
          ...images.map((image) => ({
            type: 'image' as const,
            url: image.imageBase64,
          })),
        ],
      },
    ],
    modelRuntime,
    {
      abortSignal,
      validate: (value) => {
        let review: ScrollReview;
        if (measuredStall) {
          const evidence = measuredStallReviewSchema.parse(value);
          review = {
            progress: 'unchanged',
            observation: `The target's own scroll offsets did not change. ${evidence.observation}`,
            nextSearchDirection: evidence.nextSearchDirection,
          };
        } else {
          review = scrollReviewSchema.parse(value);
        }
        if (
          review.progress !== 'unchanged' &&
          review.nextSearchDirection !== null
        )
          throw new Error(
            'A moved or uncertain scroll must have nextSearchDirection: null',
          );
        if (review.nextSearchDirection === direction)
          throw new Error(
            `The stalled direction was ${direction}. Choose a different direction only if visible overflow supports it, otherwise use null.`,
          );
        return review;
      },
    },
  );
  return result;
}

export function scrollReviewFeedback(review: ScrollReview): string {
  return `Independent visual inspection of the last scroll: ${review.observation}\n${review.nextSearchDirection ? `For an off-screen search, explore the supported ${review.nextSearchDirection} direction before repeating the stalled scroll, changing focus, or using keyboard scrolling.` : 'Reassess the scroll target and available axes using this observation.'} Explicit user direction and distance instructions take priority. This review describes observations, not an executed action.`;
}
