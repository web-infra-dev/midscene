import {
  PauseCircleOutlined,
  PictureOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { TestRunReportAttempt } from '@midscene/core';
import { formatTimelineTime } from '../timeline/timeline-scale';
import type { RunnerPositionedVisualFrame } from './model';

export function RunnerAttemptTimeline({
  attempt,
  frames,
  selectedStepId,
  previewFrameKey,
  lockedFrameKey,
  isPlaying,
  onPreview,
  onSelectFrame,
  onTogglePlay,
}: {
  attempt: TestRunReportAttempt;
  frames: readonly RunnerPositionedVisualFrame[];
  selectedStepId?: string;
  previewFrameKey?: string;
  lockedFrameKey?: string;
  isPlaying: boolean;
  onPreview(frameKey: string | undefined): void;
  onSelectFrame(frame: RunnerPositionedVisualFrame): void;
  onTogglePlay(): void;
}): JSX.Element {
  const measuredDurationMs = Math.max(
    0,
    Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt),
  );
  const timelineDurationMs = Math.max(
    1,
    attempt.durationMs,
    measuredDurationMs,
    frames.at(-1)?.offsetMs ?? 0,
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => ratio * timelineDurationMs,
  );
  const previewFrame = frames.find(
    (item) => item.frame.key === previewFrameKey,
  );

  return (
    <section
      className="runner-detail-timeline-card"
      aria-label="Attempt visual timeline"
    >
      <div className="runner-detail-timeline-toolbar">
        <span>
          <PictureOutlined />
          <strong>Visual timeline</strong>
          <small>Hover to preview · click to lock</small>
        </span>
        <span>
          <small>{frames.length} captured frames</small>
          <button
            type="button"
            disabled={!frames.length}
            onClick={onTogglePlay}
          >
            {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </span>
      </div>
      {frames.length ? (
        <div
          className="runner-detail-timeline-track"
          onMouseLeave={() => onPreview(undefined)}
        >
          <div className="runner-detail-timeline-axis" aria-hidden="true">
            {ticks.map((tick, index) => (
              <span key={`${tick}-${index}`} style={{ left: `${index * 25}%` }}>
                {formatTimelineTime(tick)}
              </span>
            ))}
          </div>
          <div className="runner-detail-timeline-lane">
            {ticks.map((tick, index) => (
              <i key={`${tick}-${index}`} style={{ left: `${index * 25}%` }} />
            ))}
            {frames.map((item, index) => {
              const isPreview = item.frame.key === previewFrameKey;
              const isLocked = item.frame.key === lockedFrameKey;
              const isSelectedStep = item.stepId === selectedStepId;
              return (
                <button
                  type="button"
                  aria-label={`${item.frame.label} at ${formatTimelineTime(
                    item.offsetMs,
                  )}`}
                  aria-pressed={isLocked}
                  className={`runner-detail-timeline-frame ${
                    isSelectedStep || isLocked ? 'is-selected' : ''
                  } ${isPreview ? 'is-preview' : ''}`}
                  key={`${item.frame.key}-${index}`}
                  style={{
                    left: `${Math.max(5, Math.min(95, item.offsetPercent))}%`,
                    zIndex: index + 2,
                  }}
                  onBlur={() => onPreview(undefined)}
                  onClick={() => onSelectFrame(item)}
                  onFocus={() => onPreview(item.frame.key)}
                  onMouseEnter={() => onPreview(item.frame.key)}
                >
                  <img
                    alt="Captured application state"
                    loading="lazy"
                    src={item.frame.screenshot.base64}
                  />
                  <span>{index + 1}</span>
                </button>
              );
            })}
            {previewFrame ? (
              <div
                className="runner-detail-timeline-preview-callout"
                style={{
                  left: `${Math.max(
                    7,
                    Math.min(78, previewFrame.offsetPercent),
                  )}%`,
                }}
              >
                <strong>{previewFrame.frame.label}</strong>
                <small>
                  {formatTimelineTime(previewFrame.offsetMs)} · click to lock
                </small>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="runner-detail-no-visual">
          <PictureOutlined />
          <span>
            No visual evidence was captured in this Attempt. The execution steps
            and runtime data are still available below.
          </span>
        </div>
      )}
    </section>
  );
}
