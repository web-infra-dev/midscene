import { PictureOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import {
  DEFAULT_TIMELINE_MAX_TIME_MS,
  formatTimelineTime,
  pickNiceStep,
} from '../timeline/timeline-scale';
import type { RunnerVisualFrame } from './model';
import { formatDuration } from './view-primitives';

export function VisualTimeline({
  frames,
  durationMs,
}: {
  frames: readonly RunnerVisualFrame[];
  durationMs?: number;
}): JSX.Element {
  if (!frames.length) {
    return (
      <div className="runner-no-visual is-compact">
        <PictureOutlined />
        <span>No visual evidence for this attempt</span>
      </div>
    );
  }

  const capturedTimes = frames.flatMap((frame) =>
    frame.capturedAt === undefined ? [] : [frame.capturedAt],
  );
  const firstCapturedAt = capturedTimes.length
    ? Math.min(...capturedTimes)
    : undefined;
  const lastCapturedAt = capturedTimes.length
    ? Math.max(...capturedTimes)
    : undefined;
  const capturedSpanMs =
    firstCapturedAt !== undefined && lastCapturedAt !== undefined
      ? Math.max(0, lastCapturedAt - firstCapturedAt)
      : 0;
  const timelineDurationMs =
    capturedSpanMs || durationMs || DEFAULT_TIMELINE_MAX_TIME_MS;
  const frameOffset = (frame: RunnerVisualFrame, index: number): number => {
    if (firstCapturedAt !== undefined && frame.capturedAt !== undefined) {
      return Math.max(0, frame.capturedAt - firstCapturedAt);
    }
    if (frames.length <= 1) return 0;
    return (timelineDurationMs * index) / (frames.length - 1);
  };
  const positionedFrames = frames
    .map((frame, sourceIndex) => ({
      frame,
      offsetMs: frameOffset(frame, sourceIndex),
      sourceIndex,
    }))
    .sort((a, b) => a.offsetMs - b.offsetMs || a.sourceIndex - b.sourceIndex);
  const scaleMaxTimeMs = Math.max(
    timelineDurationMs,
    positionedFrames.at(-1)?.offsetMs ?? 0,
    DEFAULT_TIMELINE_MAX_TIME_MS,
  );
  const timeStepMs = pickNiceStep(scaleMaxTimeMs / 4);
  const visibleMaxTimeMs = Math.max(
    timeStepMs,
    Math.ceil(scaleMaxTimeMs / timeStepMs) * timeStepMs,
  );
  const ticks: number[] = [];
  for (
    let tickMs = timeStepMs;
    tickMs < visibleMaxTimeMs;
    tickMs += timeStepMs
  ) {
    ticks.push(tickMs);
  }
  return (
    <div
      className="runner-visual-timeline"
      aria-label={`Visual evidence timeline with ${frames.length} frames from 0 to ${formatDuration(
        timelineDurationMs,
      )}`}
    >
      <div className="runner-visual-timeline-grid" aria-hidden="true">
        {ticks.map((tickMs) => (
          <span
            key={tickMs}
            style={{ left: `${(tickMs / visibleMaxTimeMs) * 100}%` }}
          >
            <small>{formatTimelineTime(tickMs)}</small>
          </span>
        ))}
      </div>
      <ol className="runner-visual-timeline-track">
        {positionedFrames.map(({ frame, offsetMs, sourceIndex }, index) => {
          return (
            <li
              key={`${frame.key}-${sourceIndex}`}
              style={{ left: `${(offsetMs / visibleMaxTimeMs) * 100}%` }}
            >
              <Tooltip
                mouseEnterDelay={0.08}
                placement="top"
                overlayClassName="runner-frame-preview-tooltip"
                title={
                  <figure className="runner-frame-preview">
                    <img
                      alt={`${frame.label}, enlarged frame ${index + 1}`}
                      src={frame.screenshot.base64}
                    />
                    <figcaption>
                      <span>
                        {formatTimelineTime(offsetMs)} · {index + 1} /{' '}
                        {positionedFrames.length}
                      </span>
                      <strong>{frame.label}</strong>
                    </figcaption>
                  </figure>
                }
              >
                <figure className="runner-visual-timeline-frame runner-visual-frame">
                  <img
                    alt={`${frame.label}, frame ${index + 1}`}
                    loading="lazy"
                    src={frame.screenshot.base64}
                  />
                  <span className="runner-visual-frame-index">{index + 1}</span>
                </figure>
              </Tooltip>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
