import { buildObservationChangeFocus } from '@/agent/observation-change-focus';
import { selectEvenlySpacedIndices } from '@/agent/observation-frame-selection';
import type { MessageContent } from '@/ai-model/service-caller/types';
import type { ScreenshotItem } from '@/screenshot-item';
import type {
  Rect,
  ScreenshotSequenceEvidence,
  ScreenshotSequenceEvidenceFrame,
} from '@/types';

const maximumObservationModelImages = 8;

type UserContent = MessageContent[];

export interface ObservationPromptEvidence {
  content: UserContent;
  reportEvidence: ScreenshotSequenceEvidence;
}

function frameContent(
  frames: ScreenshotSequenceEvidenceFrame[],
  sourceFrameCount: number,
): UserContent {
  return frames.flatMap(({ screenshot, sourceFrameIndex, role }) => [
    {
      type: 'text' as const,
      text: `${role === 'change-regions' ? 'Changed-region grid' : 'Full-screen image'} from source Frame ${sourceFrameIndex + 1}/${sourceFrameCount} (${role})`,
    },
    {
      type: 'image' as const,
      url: screenshot.base64,
      detail: 'high' as const,
    },
  ]);
}

export async function buildObservationPromptEvidence(
  screenshots: ScreenshotItem[],
  abortSignal?: AbortSignal,
  observationRegion?: Rect,
): Promise<ObservationPromptEvidence> {
  const focus = await buildObservationChangeFocus(
    screenshots,
    abortSignal,
    observationRegion,
  );

  const introduction = {
    type: 'text' as const,
    text: `The source observation contains ${screenshots.length} consecutive screenshots ordered from earliest to latest. The evidence images below are a bounded selection derived from that source sequence, not necessarily every captured frame. Frame labels always refer to positions in the original source sequence. Interpret the temporal scope from <DATA_DEMAND>: for an appearance-at-any-point question, inspect all supplied evidence; for final or current state, use the full-screen final frame; for a change, compare the selected frames in order.`,
  };

  if (!focus) {
    const frames = selectEvenlySpacedIndices(
      screenshots.length,
      maximumObservationModelImages,
    ).map(
      (sourceFrameIndex): ScreenshotSequenceEvidenceFrame => ({
        screenshot: screenshots[sourceFrameIndex],
        sourceFrameIndex,
        role:
          sourceFrameIndex === 0
            ? 'baseline'
            : sourceFrameIndex === screenshots.length - 1
              ? 'final'
              : 'full-frame',
      }),
    );
    return {
      content: [introduction, ...frameContent(frames, screenshots.length)],
      reportEvidence: { frames },
    };
  }

  const focusDescription = {
    type: 'text' as const,
    text: `The changed-region images are matching grids enlarged from selected source frames. Each cell keeps the same region number and position over time. The orange outline marks the exact peak patch used for the deterministic brightness and pixel-difference measurements relative to Frame 1. Those measurements prove only that pixels changed inside that patch, not that a named control changed state. Visually verify the control relevant to <DATA_DEMAND>; unrelated activity elsewhere may have a stronger change. Candidate regions: ${focus.regions.map(({ rect, measurementRect }, index) => `region ${index + 1} (left ${rect.left}, top ${rect.top}, width ${rect.width}, height ${rect.height}); measured patch (left ${measurementRect.left}, top ${measurementRect.top}, width ${measurementRect.width}, height ${measurementRect.height})`).join('; ')}.`,
  };
  const lastFrameIndex = screenshots.length - 1;
  const frames: ScreenshotSequenceEvidenceFrame[] = [
    ...focus.frames,
    { screenshot: screenshots[0], sourceFrameIndex: 0, role: 'baseline' },
    {
      screenshot: screenshots[lastFrameIndex],
      sourceFrameIndex: lastFrameIndex,
      role: 'final',
    },
  ];
  return {
    content: [
      introduction,
      focusDescription,
      ...frameContent(frames, screenshots.length),
    ],
    reportEvidence: { frames },
  };
}
