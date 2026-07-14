import {
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderSemantic,
} from '@midscene/shared/recorder';
import { useTextTruncation } from '@midscene/visualizer';
import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import type {
  StudioRecordedEvent,
  StudioRecordingSession,
} from '../../recorder/types';
import { StudioModeTab } from '../../recorder/types';
import {
  StudioTimelineEmptyState,
  StudioTimelinePanel,
} from '../StudioTimelinePanel';
import {
  RecorderButtonIcon,
  RecorderGenerateNaturalLanguageIcon,
  RecorderOperatingIcon,
  RecorderScreenshotIcon,
} from './assets/recorder-icons';

interface RecorderFloatingPanelProps {
  canStartRecording: boolean;
  canGenerateMarkdown: boolean;
  error?: string | null;
  isMarkdownGenerating: boolean;
  isRecording: boolean;
  isStoppingRecording: boolean;
  onGenerateMarkdown: () => void;
  onShowScreenshots: () => void;
  onToggleCollapsed: () => void;
  onToggleRecording: () => void;
  recorderPanelEvents: StudioRecordedEvent[];
  recorderPanelSession: StudioRecordingSession | null;
  showExpandedDetail: boolean;
  timelineCollapsed: boolean;
  statusText: string;
  detailView: ReactNode;
}

function RecorderFloatingTimeline({
  events,
  isRecording,
}: {
  events: StudioRecordedEvent[];
  isRecording: boolean;
}) {
  if (events.length === 0 && !isRecording) {
    return (
      <StudioTimelineEmptyState
        description="The recording progress will be displayed here."
        title="No tasks available"
        variant={StudioModeTab.Record}
      />
    );
  }

  return (
    <ol className="studio-recorder-timeline-list">
      {events.map((event, index) => (
        <li
          className="studio-recorder-timeline-item"
          key={event.hashId ?? index}
        >
          <span aria-hidden="true" className="studio-recorder-timeline-rail">
            <span className="studio-recorder-timeline-rail-line studio-recorder-timeline-rail-line-top" />
            <StudioTimelineEventIcon event={event} />
            <span className="studio-recorder-timeline-rail-line studio-recorder-timeline-rail-line-bottom" />
          </span>
          <StudioTimelineEventCopy event={event} />
        </li>
      ))}
    </ol>
  );
}

function StudioTimelineEventCopy({ event }: { event: StudioRecordedEvent }) {
  const tooltip = getStudioTimelineEventTooltip(event);
  const { ref, truncated } = useTextTruncation<HTMLSpanElement>(
    tooltip,
    'multi-line',
  );
  const copy = (
    <span className="studio-recorder-timeline-copy">
      <span className="studio-recorder-timeline-copy-text" ref={ref}>
        <StudioTimelineEventText event={event} />
      </span>
    </span>
  );

  return truncated ? <Tooltip title={tooltip}>{copy}</Tooltip> : copy;
}

function StudioTimelineTargetIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M6 8C6 8.53043 6.21071 9.03914 6.58579 9.41421C6.96086 9.78929 7.46957 10 8 10C8.53043 10 9.03914 9.78929 9.41421 9.41421C9.78929 9.03914 10 8.53043 10 8C10 7.46957 9.78929 6.96086 9.41421 6.58579C9.03914 6.21071 8.53043 6 8 6C7.46957 6 6.96086 6.21071 6.58579 6.58579C6.21071 6.96086 6 7.46957 6 8Z"
        fill="currentColor"
      />
      <path
        d="M8.66667 2.71267V1.33333H7.33333V2.71267C6.16011 2.86224 5.06977 3.39716 4.23346 4.23346C3.39716 5.06977 2.86224 6.16011 2.71267 7.33333H1.33333V8.66667H2.71267C2.86213 9.83993 3.39701 10.9303 4.23334 11.7667C5.06967 12.603 6.16007 13.1379 7.33333 13.2873V14.6667H8.66667V13.2873C9.83993 13.1379 10.9303 12.603 11.7667 11.7667C12.603 10.9303 13.1379 9.83993 13.2873 8.66667H14.6667V7.33333H13.2873C13.1378 6.16011 12.6028 5.06977 11.7665 4.23346C10.9302 3.39716 9.83989 2.86224 8.66667 2.71267ZM8 12C5.794 12 4 10.206 4 8C4 5.794 5.794 4 8 4C10.206 4 12 5.794 12 8C12 10.206 10.206 12 8 12Z"
        fill="currentColor"
      />
    </svg>
  );
}

function StudioTimelineScrollIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M8 4.66667V13.9665"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.333"
      />
      <path
        d="M4 7.33333 8 3.33333 12 7.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.333"
      />
      <path
        d="M4 2H12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.333"
      />
    </svg>
  );
}

function getStudioTimelineEventType(event: StudioRecordedEvent) {
  return (event.actionType || event.type || '').toLowerCase();
}

function StudioTimelineEventIcon({ event }: { event: StudioRecordedEvent }) {
  const eventType = getStudioTimelineEventType(event);
  if (eventType === 'scroll') {
    return (
      <span className="studio-recorder-timeline-icon studio-recorder-timeline-icon-scroll">
        <StudioTimelineScrollIcon />
      </span>
    );
  }

  return (
    <span className="studio-recorder-timeline-icon studio-recorder-timeline-icon-target">
      <StudioTimelineTargetIcon />
    </span>
  );
}

function getStudioTimelineEventTitle(event: StudioRecordedEvent) {
  const eventType = getStudioTimelineEventType(event);
  switch (eventType) {
    case 'tap':
    case 'click':
      return 'Click';
    case 'drag':
      return 'Drag';
    case 'input':
      return 'Input';
    case 'scroll':
      return 'Scroll';
    case 'navigation':
      return 'Navigate';
    case 'setviewport':
      return 'Set viewport';
    case 'keydown':
      return 'Key down';
    default:
      return event.type || event.actionType || 'Event';
  }
}

function getStudioTimelineEventDescription(event: StudioRecordedEvent) {
  const eventTitle = getStudioTimelineEventTitle(event);
  const semantic = getMidsceneRecorderSemantic(event);
  const actionSummary =
    'actionSummary' in event && typeof event.actionSummary === 'string'
      ? event.actionSummary
      : '';
  if (semantic?.status === 'ready') {
    return trimStudioTimelineEventTitlePrefix(
      getMidsceneRecorderEventDescription(event),
      eventTitle,
    );
  }

  if (semantic?.status === 'pending') {
    return '';
  }

  if (actionSummary) {
    return trimStudioTimelineEventTitlePrefix(actionSummary, eventTitle);
  }

  if (getStudioTimelineEventType(event) === 'scroll') {
    return (
      trimStudioTimelineEventTitlePrefix(
        getMidsceneRecorderEventDescription(event),
        eventTitle,
      ) || 'recorded scroll'
    );
  }

  if (event.value) {
    return event.value;
  }

  return trimStudioTimelineEventTitlePrefix(
    getMidsceneRecorderEventDescription(event),
    eventTitle,
  );
}

function trimStudioTimelineEventTitlePrefix(
  description: string,
  title: string,
) {
  const prefix = `${title} - `;
  return description.startsWith(prefix)
    ? description.slice(prefix.length)
    : description;
}

function getStudioTimelineEventTooltip(event: StudioRecordedEvent) {
  const title = getStudioTimelineEventTitle(event);
  const description = getStudioTimelineEventDescription(event);
  const semantic = getMidsceneRecorderSemantic(event);
  const text =
    description ||
    (semantic?.status === 'pending' ? 'analyzing target...' : '');

  return text ? `${title} - ${text}` : title;
}

function StudioTimelineEventText({ event }: { event: StudioRecordedEvent }) {
  const title = getStudioTimelineEventTitle(event);
  const description = getStudioTimelineEventDescription(event);
  const semantic = getMidsceneRecorderSemantic(event);

  return (
    <>
      <span className="studio-recorder-timeline-action">{title}</span>
      {description ? (
        <>
          <span> - </span>
          <span>{description}</span>
        </>
      ) : semantic?.status === 'pending' ? (
        <>
          <span> - </span>
          <span className="studio-recorder-timeline-analyzing">
            analyzing target...
          </span>
        </>
      ) : null}
    </>
  );
}

function getStudioRecorderEventScreenshot(event: StudioRecordedEvent) {
  return (
    event.screenshotWithBox ||
    event.screenshotAfter ||
    event.screenshotBefore ||
    event.screenshotAsset?.id
  );
}

function hasStudioRecorderEventScreenshots(events: StudioRecordedEvent[]) {
  return events.some((event) =>
    Boolean(getStudioRecorderEventScreenshot(event)),
  );
}

function formatStudioRecorderScreenshotEventName(
  event: StudioRecordedEvent,
  screenshotIndex: number,
) {
  return `screenshot-${String(screenshotIndex + 1).padStart(3, '0')}-${event.type}`;
}

function RecorderFloatingOutputs({
  canGenerateMarkdown,
  canShowScreenshots,
  isMarkdownGenerating,
  onGenerateMarkdown,
  onShowScreenshots,
  recorderPanelSession,
}: {
  canGenerateMarkdown: boolean;
  canShowScreenshots: boolean;
  isMarkdownGenerating: boolean;
  onGenerateMarkdown: () => void;
  onShowScreenshots: () => void;
  recorderPanelSession: StudioRecordingSession | null;
}) {
  let markdownOutput: ReactNode = null;

  if (isMarkdownGenerating) {
    markdownOutput = (
      <button
        aria-label="Generating markdown"
        className="studio-recorder-floating-output studio-recorder-floating-output-generate studio-recorder-floating-output-generating"
        disabled
        type="button"
      >
        <RecorderGenerateNaturalLanguageIcon />
        <span data-text="Generating markdown...">Generating markdown...</span>
      </button>
    );
  } else if (canGenerateMarkdown && recorderPanelSession) {
    markdownOutput = (
      <button
        aria-label="Generate markdown"
        className="studio-recorder-floating-output studio-recorder-floating-output-generate"
        onClick={onGenerateMarkdown}
        type="button"
      >
        <RecorderGenerateNaturalLanguageIcon />
        <span>Generate markdown</span>
      </button>
    );
  }

  if (canShowScreenshots && recorderPanelSession) {
    return (
      <div className="studio-recorder-floating-output-stack">
        {markdownOutput}
        <button
          aria-label="Show event screenshots"
          className="studio-recorder-floating-output studio-recorder-floating-output-generate"
          onClick={onShowScreenshots}
          type="button"
        >
          <RecorderScreenshotIcon />
          <span>Screenshots</span>
        </button>
      </div>
    );
  }

  return markdownOutput;
}

export function RecorderScreenshotDetailView({
  events,
}: {
  events: StudioRecordedEvent[];
}) {
  const screenshotEvents = events
    .map((event, index) => ({
      event,
      index,
      screenshot: getStudioRecorderEventScreenshot(event),
    }))
    .filter(
      (
        item,
      ): item is {
        event: StudioRecordedEvent;
        index: number;
        screenshot: string;
      } => Boolean(item.screenshot),
    );

  return (
    <section className="studio-recorder-screenshot-detail">
      <header className="studio-recorder-screenshot-detail-header">
        <div className="studio-recorder-screenshot-detail-title">
          <RecorderScreenshotIcon />
          <span>Screenshots</span>
        </div>
      </header>

      {screenshotEvents.length > 0 ? (
        <div className="studio-recorder-screenshot-list">
          {screenshotEvents.map(({ event, index, screenshot }, itemIndex) => {
            const title = getStudioTimelineEventTitle(event);
            const description = getStudioTimelineEventDescription(event);
            const imageSource = screenshot.startsWith('data:')
              ? screenshot
              : `data:image/png;base64,${screenshot}`;
            const screenshotFileName = formatStudioRecorderScreenshotEventName(
              event,
              itemIndex,
            );

            return (
              <article
                className="studio-recorder-screenshot-card"
                key={event.hashId ?? index}
              >
                <div className="studio-recorder-screenshot-card-header">
                  <span>#{itemIndex + 1}</span>
                  <span>{screenshotFileName}</span>
                </div>
                <div className="studio-recorder-screenshot-card-body">
                  <button
                    aria-label={`Open ${screenshotFileName} in system image viewer`}
                    className="studio-recorder-screenshot-image-button"
                    onClick={() => {
                      void window.electronShell?.openImagePreview({
                        data: imageSource,
                        fileName: `${screenshotFileName}.png`,
                      });
                    }}
                    title="Open with system image viewer"
                    type="button"
                  >
                    <img
                      alt={`${title}${description ? ` - ${description}` : ''}`}
                      src={imageSource}
                    />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="studio-recorder-empty">
          No screenshots available for this recording.
        </div>
      )}
    </section>
  );
}

export function RecorderFloatingPanel({
  canStartRecording,
  canGenerateMarkdown,
  detailView,
  error,
  isMarkdownGenerating,
  isRecording,
  isStoppingRecording,
  onGenerateMarkdown,
  onShowScreenshots,
  onToggleCollapsed,
  onToggleRecording,
  recorderPanelEvents,
  recorderPanelSession,
  showExpandedDetail,
  timelineCollapsed,
  statusText,
}: RecorderFloatingPanelProps) {
  const showRecordingVisual = isRecording && !isStoppingRecording;
  const recordingButtonLabel = isStoppingRecording
    ? 'Stopping recording'
    : showRecordingVisual
      ? 'Stop recording'
      : 'Start recording';
  const recordingButtonTitle = isStoppingRecording
    ? 'Stopping recording'
    : showRecordingVisual
      ? 'Stop recording'
      : statusText;
  const controlCardClassName = [
    'studio-recorder-control-card',
    showRecordingVisual ? 'studio-recorder-control-card-recording' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const isTimelineEmpty =
    recorderPanelEvents.length === 0 &&
    !showRecordingVisual &&
    !showExpandedDetail;
  const taskCardClassName = 'studio-recorder-task-card';
  const mainClassName = [
    'studio-recorder-floating-main',
    timelineCollapsed ? 'studio-recorder-floating-main-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const outputsClassName = [
    'studio-recorder-floating-outputs',
    hasStudioRecorderEventScreenshots(recorderPanelEvents) &&
    !isRecording &&
    !showExpandedDetail
      ? 'studio-recorder-floating-outputs-with-screenshot'
      : '',
    timelineCollapsed || showExpandedDetail
      ? 'studio-recorder-floating-outputs-hidden'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const shouldShowOutputs =
    isMarkdownGenerating ||
    canGenerateMarkdown ||
    (hasStudioRecorderEventScreenshots(recorderPanelEvents) && !isRecording);
  const shouldRenderTimelinePanel =
    !isTimelineEmpty || showExpandedDetail || shouldShowOutputs;

  return (
    <div className="studio-recorder-panel">
      {error ? <div className="studio-recorder-notice">{error}</div> : null}

      <div className={controlCardClassName}>
        <header className="studio-recorder-floating-header">
          <div className="studio-recorder-floating-title">
            <span>Record</span>
          </div>
        </header>

        <div className="studio-recorder-floating-primer">
          <div className="studio-recorder-floating-primer-copy">
            {showRecordingVisual ? (
              <span
                aria-hidden="true"
                className="studio-recorder-floating-recording-dot"
              />
            ) : (
              <RecorderOperatingIcon />
            )}
            <span>
              {showRecordingVisual
                ? 'Recording your actions'
                : 'After recording, start operating'}
            </span>
          </div>
          <div className="studio-recorder-floating-start-button-shell">
            <button
              aria-label={recordingButtonLabel}
              className={
                showRecordingVisual
                  ? 'studio-recorder-floating-start-button studio-recorder-floating-start-button-active'
                  : 'studio-recorder-floating-start-button'
              }
              disabled={
                isStoppingRecording || (!isRecording && !canStartRecording)
              }
              onClick={onToggleRecording}
              title={recordingButtonTitle}
              type="button"
            >
              {showRecordingVisual ? (
                <span
                  aria-hidden="true"
                  className="studio-recorder-floating-stop-button-icon"
                />
              ) : (
                <RecorderButtonIcon />
              )}
              <span>
                {showRecordingVisual ? 'Stop recording' : 'Start recording'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {shouldRenderTimelinePanel ? (
        <StudioTimelinePanel
          ariaHidden={timelineCollapsed}
          className={taskCardClassName}
          collapsed={timelineCollapsed}
          contentClassName={mainClassName}
          empty={isTimelineEmpty}
          expanded={showExpandedDetail}
          footer={
            shouldShowOutputs ? (
              <footer
                aria-hidden={timelineCollapsed || showExpandedDetail}
                className={outputsClassName}
              >
                <RecorderFloatingOutputs
                  canGenerateMarkdown={canGenerateMarkdown}
                  canShowScreenshots={
                    hasStudioRecorderEventScreenshots(recorderPanelEvents) &&
                    !isRecording
                  }
                  isMarkdownGenerating={isMarkdownGenerating}
                  onGenerateMarkdown={onGenerateMarkdown}
                  onShowScreenshots={onShowScreenshots}
                  recorderPanelSession={recorderPanelSession}
                />
              </footer>
            ) : null
          }
          onToggleCollapsed={onToggleCollapsed}
          scrollBody={!isTimelineEmpty || showExpandedDetail}
          variant={StudioModeTab.Record}
        >
          <div className="studio-recorder-floating-main-content">
            {showExpandedDetail ? (
              detailView
            ) : (
              <RecorderFloatingTimeline
                events={recorderPanelEvents}
                isRecording={showRecordingVisual}
              />
            )}
          </div>
        </StudioTimelinePanel>
      ) : null}
    </div>
  );
}
