import {
  PauseCircleOutlined,
  PictureOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import type { TestRunReportAttempt } from '@midscene/core';
import { formatTimelineTime } from '../timeline/timeline-scale';
import type { RunnerPositionedVisualFrame } from './model';

export type RunnerAttemptTimelineVariant = 'standalone' | 'detail' | 'overview';

export function RunnerTimelinePlaybackControl({
  frameCount,
  isPlaying,
  compact = false,
  onTogglePlay,
}: {
  frameCount: number;
  isPlaying: boolean;
  compact?: boolean;
  onTogglePlay(): void;
}): JSX.Element {
  const action = isPlaying ? 'Pause' : 'Play';

  return (
    <button
      type="button"
      className={`runner-detail-timeline-control ${
        compact ? 'is-compact' : ''
      }`}
      disabled={!frameCount}
      aria-label={`${action} timeline of ${frameCount} captured frames`}
      title={`${action} visual timeline`}
      onClick={onTogglePlay}
    >
      {isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
      {compact ? null : action}
    </button>
  );
}

export function RunnerAttemptTimeline({
  attempt,
  frames,
  selectedStepId,
  previewFrameKey,
  lockedFrameKey,
  isPlaying,
  variant = 'standalone',
  onPreview,
  onSelectFrame,
  onTogglePlay,
}: {
  attempt?: TestRunReportAttempt;
  frames: readonly RunnerPositionedVisualFrame[];
  selectedStepId?: string;
  previewFrameKey?: string;
  lockedFrameKey?: string;
  isPlaying?: boolean;
  variant?: RunnerAttemptTimelineVariant;
  onPreview(frameKey: string | undefined): void;
  onSelectFrame(frame: RunnerPositionedVisualFrame): void;
  onTogglePlay?(): void;
}): JSX.Element {
  const measuredDurationMs = attempt
    ? Math.max(0, Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt))
    : 0;
  const timelineDurationMs = Math.max(
    1,
    attempt?.durationMs ?? 0,
    measuredDurationMs,
    frames.at(-1)?.offsetMs ?? 0,
  );
  const isEmbedded = variant !== 'standalone';
  const tickRatios = isEmbedded
    ? [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]
    : [0, 0.25, 0.5, 0.75, 1];
  const ticks = tickRatios.map((ratio) => ratio * timelineDurationMs);
  const previewFrame = frames.find(
    (item) => item.frame.key === previewFrameKey,
  );

  return (
    <section
      className={`runner-detail-timeline-card is-${variant}`}
      aria-label="Attempt visual timeline"
    >
      {!isEmbedded ? (
        <div className="runner-detail-timeline-toolbar">
          <span>
            <PictureOutlined />
            <strong>Visual timeline</strong>
            <small>Hover to preview</small>
          </span>
          <span>
            <small>{frames.length} captured frames</small>
            {onTogglePlay ? (
              <RunnerTimelinePlaybackControl
                frameCount={frames.length}
                isPlaying={Boolean(isPlaying)}
                onTogglePlay={onTogglePlay}
              />
            ) : null}
          </span>
        </div>
      ) : null}
      {frames.length ? (
        <div
          className="runner-detail-timeline-track"
          onMouseLeave={() => onPreview(undefined)}
        >
          <div className="runner-detail-timeline-axis" aria-hidden="true">
            {ticks.map((tick, index) => (
              <span
                key={`${tick}-${index}`}
                style={{ left: `${tickRatios[index] * 100}%` }}
              >
                {isEmbedded
                  ? `${Math.round(tick)}ms`
                  : formatTimelineTime(tick)}
              </span>
            ))}
          </div>
          <div className="runner-detail-timeline-lane">
            {ticks.map((tick, index) => (
              <i
                key={`${tick}-${index}`}
                style={{ left: `${tickRatios[index] * 100}%` }}
              />
            ))}
            {frames.map((item, index) => {
              const isPreview = item.frame.key === previewFrameKey;
              const isSelected = item.stepId
                ? item.stepId === selectedStepId
                : item.frame.key === lockedFrameKey;
              return (
                <button
                  type="button"
                  aria-label={`${item.frame.label} at ${formatTimelineTime(
                    item.offsetMs,
                  )}`}
                  aria-pressed={isSelected}
                  className={`runner-detail-timeline-frame ${
                    isSelected ? 'is-selected' : ''
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
                    alt={item.frame.label || 'Captured application state'}
                    loading="lazy"
                    src={item.frame.screenshot.base64}
                  />
                  <span>{index + 1}</span>
                </button>
              );
            })}
            {previewFrame ? (
              <figure
                className="runner-detail-timeline-preview-callout"
                style={{
                  left: `clamp(228px, ${Math.max(
                    5,
                    Math.min(95, previewFrame.offsetPercent),
                  )}%, calc(100% - 228px))`,
                }}
              >
                <img
                  alt={`Preview of ${
                    previewFrame.frame.label || 'captured application state'
                  }`}
                  src={previewFrame.frame.screenshot.base64}
                />
                <figcaption>
                  <strong>{previewFrame.frame.label}</strong>
                  <small>{formatTimelineTime(previewFrame.offsetMs)}</small>
                </figcaption>
              </figure>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="runner-detail-no-visual">
          <PictureOutlined />
          <span>
            {variant === 'overview'
              ? 'No visual evidence for this attempt'
              : 'No visual evidence was captured in this Attempt. The execution steps and runtime data are still available below.'}
          </span>
        </div>
      )}
    </section>
  );
}
