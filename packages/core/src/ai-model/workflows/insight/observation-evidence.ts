import { buildObservationChangeFocus } from '@/agent/observation-change-focus';
import { selectEvenlySpacedIndices } from '@/agent/observation-frame-selection';
import type { ScreenshotItem } from '@/screenshot-item';
import type { ScreenshotSequenceEvidence } from '@/types';
import { getDebug } from '@midscene/shared/logger';
import type { ChatCompletionUserMessageParam } from 'openai/resources/index';

const debugInsight = getDebug('ai:insight');
const maximumObservationModelImages = 8;

type UserContent = Exclude<ChatCompletionUserMessageParam['content'], string>;

export interface ObservationPromptEvidence {
  content: UserContent;
  reportEvidence?: ScreenshotSequenceEvidence;
}

function originalFrameContent(screenshots: ScreenshotItem[]): UserContent {
  return selectEvenlySpacedIndices(
    screenshots.length,
    maximumObservationModelImages,
  ).flatMap((sourceFrameIndex) => [
    {
      type: 'text' as const,
      text: `Source frame ${sourceFrameIndex + 1}/${screenshots.length}`,
    },
    {
      type: 'image_url' as const,
      image_url: {
        url: screenshots[sourceFrameIndex].base64,
        detail: 'high' as const,
      },
    },
  ]);
}

export async function buildObservationPromptEvidence(
  screenshots: ScreenshotItem[],
  abortSignal?: AbortSignal,
): Promise<ObservationPromptEvidence> {
  let focus;
  try {
    focus = await buildObservationChangeFocus(screenshots, abortSignal);
  } catch (error) {
    abortSignal?.throwIfAborted();
    debugInsight(
      'Failed to build focused observation evidence; falling back to full frames',
      error,
    );
  }

  const introduction = {
    type: 'text' as const,
    text: `The source observation contains ${screenshots.length} consecutive screenshots ordered from earliest to latest. The evidence images below are a bounded selection derived from that source sequence, not necessarily every captured frame. Frame labels always refer to positions in the original source sequence. Interpret the temporal scope from <DATA_DEMAND>: for an appearance-at-any-point question, inspect all supplied evidence; for final or current state, use the full-screen final frame; for a change, compare the selected frames in order.`,
  };

  if (!focus) {
    return { content: [introduction, ...originalFrameContent(screenshots)] };
  }

  const focusDescription = {
    type: 'text' as const,
    text: `The changed-region images are matching grids enlarged from selected source frames. Each cell keeps the same region number and position over time. The orange outline marks the exact peak patch used for the deterministic brightness and pixel-difference measurements relative to Frame 1. Those measurements prove only that pixels changed inside that patch, not that a named control changed state. Visually verify the control relevant to <DATA_DEMAND>; unrelated activity elsewhere may have a stronger change. Candidate regions: ${focus.rects.map((rect, index) => `region ${index + 1} (left ${rect.left}, top ${rect.top}, width ${rect.width}, height ${rect.height}); measured patch (left ${focus.measurementRects[index].left}, top ${focus.measurementRects[index].top}, width ${focus.measurementRects[index].width}, height ${focus.measurementRects[index].height})`).join('; ')}.`,
  };
  const focusContent = focus.frames.flatMap(
    ({ screenshot, sourceFrameIndex }) => [
      {
        type: 'text' as const,
        text: `Changed-region grid from source Frame ${sourceFrameIndex + 1}/${screenshots.length}`,
      },
      {
        type: 'image_url' as const,
        image_url: { url: screenshot.base64, detail: 'high' as const },
      },
    ],
  );
  const lastFrameIndex = screenshots.length - 1;
  return {
    content: [
      introduction,
      focusDescription,
      ...focusContent,
      {
        type: 'text',
        text: 'Full-screen baseline for spatial context (source Frame 1).',
      },
      {
        type: 'image_url',
        image_url: { url: screenshots[0].base64, detail: 'high' },
      },
      {
        type: 'text',
        text: `Full-screen final state (source Frame ${screenshots.length}).`,
      },
      {
        type: 'image_url',
        image_url: {
          url: screenshots[lastFrameIndex].base64,
          detail: 'high',
        },
      },
    ],
    reportEvidence: { frames: focus.frames },
  };
}
