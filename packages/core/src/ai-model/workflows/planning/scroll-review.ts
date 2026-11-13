import type {
  ActionScrollParam,
  ExecutionTask,
  ScrollState,
  UIContext,
} from '@/types';
import { z } from 'zod';
import { prepareModelImage } from '../../model-adapter/image-preprocess';
import type { ModelRuntime } from '../../models';
import {
  type AIObjectResponse,
  callAIWithObjectResponse,
} from '../../service-caller';

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

export function nativeScrollReview(
  task: ExecutionTask,
): ScrollReview | undefined {
  if (task.scrollProgress?.status !== 'unchanged' || !confirmedTarget(task))
    return undefined;
  const state = task.scrollProgress.after;
  const available = availableScrollDirections(state);
  if (!state || !available) return undefined;
  const direction = scrollDirection(task);
  return {
    progress: 'unchanged',
    observation: `The target's own scroll offsets did not change. Native offsets are (${state.scrollLeft}, ${state.scrollTop}), with maximum offsets (${state.maxScrollLeft}, ${state.maxScrollTop}). Directions with remaining native range: ${available.join(', ') || 'none'}. ${available.includes(direction) ? 'The requested direction still has range; reassess the dispatch position or target instead of assuming a boundary.' : 'The requested direction has no remaining native range.'} Native range does not establish whether content has loaded or the task goal is present.`,
    nextSearchDirection:
      !available.includes(direction) && available.length === 1
        ? (available[0] as ScrollReview['nextSearchDirection'])
        : null,
  };
}

/** A separate observation avoids anchoring on the previous planner's guesses. */
export async function reviewScroll(options: {
  task: ExecutionTask;
  current: UIContext;
  modelRuntime: ModelRuntime;
  abortSignal?: AbortSignal;
  userPrompt?: string;
}): Promise<AIObjectResponse<ScrollReview>> {
  const { task, current, modelRuntime, abortSignal, userPrompt } = options;
  if (!task.uiContext)
    throw new Error('Scroll review requires a before-action screenshot');
  abortSignal?.throwIfAborted();
  const direction = scrollDirection(task);
  const measuredStall = task.scrollProgress?.status === 'unchanged';
  const nativeReview = nativeScrollReview(task);
  if (nativeReview)
    return {
      content: nativeReview,
      contentString: JSON.stringify(nativeReview),
    };

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
          ...(userPrompt
            ? [
                {
                  type: 'text' as const,
                  text: `User task (context only; do not execute it): ${userPrompt}`,
                },
              ]
            : []),
          ...(task.scrollProgress
            ? [
                {
                  type: 'text' as const,
                  text: `Execution evidence for the target container (not the outer page): ${JSON.stringify(task.scrollProgress)}. Its own offset is separate from ancestor movement. maxScrollLeft and maxScrollTop are measured maximum offsets. A positive offset establishes content toward left/up; an offset below its maximum establishes content toward right/down. No movement does not establish a boundary: if the requested direction still has native range, suggest null and reassess the dispatch target or position instead of reversing direction. For unsupported or replaced targets, rely on visual evidence and remain uncertain.`,
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
              ? `The last action was Scroll ${direction}. Execution evidence establishes that this target's own scroll offset did not change. Do not reclassify ancestor displacement as target scrolling. Inspect the screenshots only for visible scrollbar orientations and clipped edges, including the viewport edges. Use measured scroll ranges first, then the visible scrollbar and clipped edges. Which other direction has supported overflow for this task? Do not assume a missing footer button is below. Return JSON with observation (describe measured ranges, visual evidence, and whether the scroll target or dispatch position needs reassessment) and nextSearchDirection ("up", "down", "left", "right", or null). Suggest a different direction only when supported by visible overflow; otherwise use null. Consider task-relevant controls such as Load more, waiting for content, or a different dispatch position before assuming the search axis is wrong. Return only a JSON object, without Markdown. Do not issue actions or infer task completion.`
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

/** Fresh facts, supplied only while recovering the same measured container. */
export function scrollPlanningFeedback(
  task: ExecutionTask,
): string | undefined {
  const state = task.scrollProgress?.after;
  if (!state || !confirmedTarget(task)) return undefined;
  const available = availableScrollDirections(state);
  if (!available) return undefined;
  return `For the same scroll container ${state.targetId}, the latest executed scroll was ${scrollDirection(task)}. Current offsets: (${state.scrollLeft}, ${state.scrollTop}); maximum offsets: (${state.maxScrollLeft}, ${state.maxScrollTop}). Remaining native distances: ${JSON.stringify({ left: state.scrollLeft, right: state.maxScrollLeft! - state.scrollLeft, up: state.scrollTop, down: state.maxScrollTop! - state.scrollTop })}. Directions with remaining range: ${available.join(', ') || 'none'}. These current measurements supersede earlier assumptions about this container. For a goal-driven search, do not repeat a direction with no remaining range on this target; choose a supported direction or reassess the target/loading controls. Choose a search distance or boundary scroll appropriate to the remaining range rather than copying the previous small step. Explicit user directions, distances, counts and stop conditions take priority. No remaining range does not establish task completion or that the requested item is absent.`;
}

export function scrollReviewFeedback(review: ScrollReview): string {
  return `Review of the last scroll: ${review.observation}\n${review.nextSearchDirection ? `A candidate search direction is ${review.nextSearchDirection}. Verify it against the task and current UI before acting; the observation may be incomplete.` : 'Reassess the scroll target, dispatch position, and task-relevant controls. No alternative direction was established.'} For goal-driven searches, choose a distance appropriate to the remaining range instead of copying the stalled scroll distance. No movement or absent direction guidance does not establish that the target is absent or the task is complete. Explicit user direction and distance instructions take priority. This review describes observations, not an executed action.`;
}
