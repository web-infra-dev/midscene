import {
  PictureOutlined,
  RightOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { Tooltip } from 'antd';
import {
  DEFAULT_TIMELINE_MAX_TIME_MS,
  formatTimelineTime,
  pickNiceStep,
} from '../timeline/timeline-scale';
import {
  type RunnerCaseView,
  type RunnerVisualFrame,
  type RunnerVisualIndex,
  getAllAttemptVisualFrames,
  getCaseFailure,
  getCaseStory,
} from './model';
import { ProjectCaseEvidence } from './project-case-evidence';
import { CaseStatus, formatDuration } from './view-primitives';

function StorySteps({ steps }: { steps: readonly string[] }): JSX.Element {
  if (!steps.length) {
    return <span className="runner-muted">No executed steps</span>;
  }
  return (
    <div className="runner-story-steps" aria-label="Case execution summary">
      {steps.map((step, index) => (
        <span className="runner-story-fragment" key={`${step}-${index}`}>
          <Tooltip title={step} mouseEnterDelay={0.25}>
            <span>{step}</span>
          </Tooltip>
          {index < steps.length - 1 ? <RightOutlined /> : null}
        </span>
      ))}
    </div>
  );
}

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

export function CasePreview({
  item,
  visualIndex,
  frames: providedFrames,
  onOpen,
}: {
  item: RunnerCaseView;
  visualIndex: RunnerVisualIndex;
  frames?: RunnerVisualFrame[];
  onOpen(item: RunnerCaseView, stepId?: string): void;
}): JSX.Element {
  const story = getCaseStory(item.testCase);
  const frames =
    providedFrames ?? getAllAttemptVisualFrames(item.finalAttempt, visualIndex);
  const failure = getCaseFailure(item.testCase);
  return (
    <article className="runner-case-row" data-case-key={item.key}>
      <div className="runner-case-main">
        <div className="runner-case-title-row">
          <CaseStatus status={item.status} />
          <button
            type="button"
            className="runner-case-title-button"
            aria-label={`Open ${item.testCase.name} in project ${item.project.name}`}
            onClick={() => onOpen(item)}
          >
            <h3>{item.testCase.name}</h3>
          </button>
        </div>
        <div className="runner-case-meta">
          <span>{item.project.name}</span>
          <span>{item.project.platform}</span>
          <span>{item.document.sourcePath}</span>
          <span>{formatDuration(item.durationMs)}</span>
          <span>
            {item.testCase.attempts.length}{' '}
            {item.testCase.attempts.length === 1 ? 'attempt' : 'attempts'}
          </span>
        </div>
        {failure ? (
          <div className="runner-case-failure">
            <WarningFilled />
            <Tooltip
              title={`${failure.node}: ${
                failure.error?.message || 'Step failed'
              }`}
            >
              <span>
                {failure.node}: {failure.error?.message || 'Step failed'}
              </span>
            </Tooltip>
          </div>
        ) : null}
        <ProjectCaseEvidence frameCount={frames.length}>
          <StorySteps steps={story} />
          <VisualTimeline
            frames={frames}
            durationMs={item.finalAttempt?.durationMs ?? item.durationMs}
          />
        </ProjectCaseEvidence>
      </div>
      <button
        type="button"
        className="runner-case-open-button runner-row-action"
        onClick={() => onOpen(item)}
        aria-label={`Open ${item.testCase.name} in project ${item.project.name}`}
      >
        <span>Inspect</span>
        <RightOutlined className="runner-case-chevron" />
      </button>
      {failure && (
        <button
          type="button"
          className="runner-case-failure-action runner-row-action"
          aria-label={`Inspect failure in ${item.testCase.name}, project ${item.project.name}`}
          onClick={() => onOpen(item, failure.id)}
        >
          Inspect failure
          <RightOutlined />
        </button>
      )}
    </article>
  );
}
