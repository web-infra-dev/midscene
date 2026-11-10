import type { ExecutionTask, UIContext } from '@/types';
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

/** Review every pair of consecutive same-direction scrolls, not every replan. */
export function findScrollToReview(
  tasks: ExecutionTask[],
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
      task.subType !== 'Scroll' ||
      task.status !== 'finished' ||
      scrollDirection(task) !== scrollDirection(last)
    )
      break;
    count++;
  }
  return count >= 2 && count % 2 === 0 ? last : undefined;
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
            text: `The last action was Scroll ${direction}. Compare the before and after screenshots. Describe whether the scrolled content moved and all visible scrollbar orientations and clipped edges, including the entire viewport edges. Which direction has unexplored content for finding the requested off-screen control? Do not assume a missing footer button is below. If the scrolled region moved along the requested axis, report that progress without suggesting a different direction. Only when it did not move should you suggest another direction supported by visible overflow. Return JSON with progress ("moved", "unchanged", or "uncertain") observation (a brief description), and nextSearchDirection ("up", "down", "left", "right", or null). When unchanged, choose a different search direction supported by the visible scrollbar or clipped edge; use null if no alternative is supported. When moved or uncertain, use null. Do not issue actions.`,
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
        const review = scrollReviewSchema.parse(value);
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
