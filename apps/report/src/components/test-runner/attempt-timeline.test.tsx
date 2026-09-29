import type { TestRunReportAttempt } from '@midscene/core';
import { describe, expect, it } from '@rstest/core';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  RunnerAttemptTimeline,
  resolveTimelinePreviewPlacement,
} from './attempt-timeline';
import type { RunnerPositionedVisualFrame } from './model';

const attempt = {
  startedAt: '2026-09-20T00:00:00.000Z',
  endedAt: '2026-09-20T00:00:01.000Z',
  durationMs: 1_000,
} as TestRunReportAttempt;

const frames: RunnerPositionedVisualFrame[] = [
  {
    frame: {
      key: 'frame-1',
      reportId: 'report',
      executionId: 'execution',
      label: 'First frame',
      screenshot: { base64: 'data:image/png;base64,first' },
    },
    offsetMs: 100,
    offsetPercent: 10,
    stepId: 'step-1',
  },
  {
    frame: {
      key: 'frame-2',
      reportId: 'report',
      executionId: 'execution',
      label: 'Second frame',
      screenshot: { base64: 'data:image/png;base64,second' },
    },
    offsetMs: 600,
    offsetPercent: 60,
    stepId: 'step-1',
  },
];

const renderTimeline = ({
  lockedFrameKey,
  previewFrameKey,
}: {
  lockedFrameKey?: string;
  previewFrameKey?: string;
} = {}) =>
  renderToStaticMarkup(
    <RunnerAttemptTimeline
      attempt={attempt}
      frames={frames}
      selectedStepId="step-1"
      previewFrameKey={previewFrameKey}
      lockedFrameKey={lockedFrameKey}
      isPlaying={false}
      variant="detail"
      onPreview={() => {}}
      onSelectFrame={() => {}}
      onTogglePlay={() => {}}
    />,
  );

describe('attempt timeline', () => {
  it('places a preview above when the remaining space below is too small', () => {
    expect(
      resolveTimelinePreviewPlacement({
        availableAbove: 420,
        availableBelow: 80,
        previewHeight: 300,
      }),
    ).toBe('above');
    expect(
      resolveTimelinePreviewPlacement({
        availableAbove: 80,
        availableBelow: 420,
        previewHeight: 300,
      }),
    ).toBe('below');
  });

  it('highlights every frame that belongs to the selected step', () => {
    const initialHtml = renderTimeline();
    expect(initialHtml).toContain(
      'left:clamp(var(--runner-timeline-frame-half-width), 10%, calc(100% - var(--runner-timeline-frame-half-width)))',
    );
    expect(initialHtml).toMatch(
      /aria-label="First frame[^"]*" aria-pressed="true"/,
    );
    expect(initialHtml).toMatch(
      /aria-label="Second frame[^"]*" aria-pressed="true"/,
    );

    const lockedHtml = renderTimeline({ lockedFrameKey: 'frame-2' });
    expect(lockedHtml).toMatch(
      /aria-label="First frame[^"]*" aria-pressed="true"/,
    );
    expect(lockedHtml).toMatch(
      /aria-label="Second frame[^"]*" aria-pressed="true"/,
    );
  });

  it('renders the hovered frame as an enlarged image preview', () => {
    const html = renderTimeline({ previewFrameKey: 'frame-2' });
    expect(html).toContain('runner-detail-timeline-preview-callout');
    expect(html).toContain('left:clamp(228px, 60%, calc(100% - 228px))');
    expect(html).toContain('alt="Preview of Second frame"');
    expect(html).toContain('src="data:image/png;base64,second"');
  });

  it('uses the same interactive frame markup in the overview density', () => {
    const html = renderToStaticMarkup(
      <RunnerAttemptTimeline
        attempt={attempt}
        frames={frames}
        previewFrameKey="frame-1"
        variant="overview"
        onPreview={() => {}}
        onSelectFrame={() => {}}
      />,
    );

    expect(html).toContain('runner-detail-timeline-card is-overview');
    expect(html).toContain('runner-detail-timeline-preview-callout');
    expect(html).toContain('aria-label="First frame at 100ms"');
    expect(html).not.toContain('runner-detail-timeline-toolbar');
  });
});
