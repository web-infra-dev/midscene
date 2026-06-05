import { RecordTimeline } from '@midscene/recorder';
import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import type {
  StudioRecordedEvent,
  StudioRecordingSession,
} from '../../recorder/types';
import {
  DownloadIcon,
  EmptyRecorderPanelIcon,
  RecorderButtonIcon,
  RecorderOutputIcon,
  RecorderPanelIcon,
  ReplayIcon,
  TimelineChevronIcon,
} from './assets/recorder-icons';

const recordingButtonIconUrl = new URL(
  './assets/recording-button.svg',
  import.meta.url,
).href;

interface RecorderFloatingPanelProps {
  canStartRecording: boolean;
  error?: string | null;
  generatedMarkdown: string;
  historyControl: ReactNode;
  isMarkdownGenerating: boolean;
  isRecording: boolean;
  isStoppingRecording: boolean;
  markdownOutputLabel: string;
  onExportMarkdown: () => void;
  onReplayMarkdown?: () => void;
  onToggleAllTimelineEvents: () => void;
  onToggleCollapsed: () => void;
  onToggleRecording: () => void;
  recorderPanelEvents: StudioRecordedEvent[];
  recorderPanelSession: StudioRecordingSession | null;
  showAllTimelineEvents: boolean;
  showCollapsed: boolean;
  showExpandedDetail: boolean;
  statusText: string;
  detailView: ReactNode;
}

function RecorderFloatingTimeline({
  events,
  isRecording,
  onToggleAllTimelineEvents,
  showAllTimelineEvents,
}: {
  events: StudioRecordedEvent[];
  isRecording: boolean;
  onToggleAllTimelineEvents: () => void;
  showAllTimelineEvents: boolean;
}) {
  if (events.length === 0 && !isRecording) {
    return (
      <div className="studio-recorder-floating-empty">
        <span className="studio-recorder-floating-empty-icon">
          <EmptyRecorderPanelIcon />
        </span>
        <span>The recording task has not yet begun.</span>
      </div>
    );
  }

  const visibleEvents = showAllTimelineEvents ? events : events.slice(-2);

  return (
    <section className="studio-recorder-floating-section">
      <div className="studio-recorder-floating-section-header">
        <div className="studio-recorder-floating-section-title">
          <span>Record Timeline</span>
          <TimelineChevronIcon />
        </div>
        {events.length > 0 ? (
          <button
            aria-label={
              showAllTimelineEvents
                ? 'Collapse record timeline'
                : 'Expand record timeline'
            }
            className={
              showAllTimelineEvents
                ? 'studio-recorder-floating-show-more studio-recorder-floating-show-more-expanded'
                : 'studio-recorder-floating-show-more'
            }
            onClick={onToggleAllTimelineEvents}
            type="button"
          >
            <span>{showAllTimelineEvents ? 'Hide more' : 'Show more'}</span>
            <TimelineChevronIcon />
          </button>
        ) : null}
      </div>
      <div
        className={
          events.length === 0
            ? 'studio-recorder-floating-timeline studio-recorder-floating-timeline-empty'
            : showAllTimelineEvents
              ? 'studio-recorder-floating-timeline studio-recorder-floating-timeline-expanded'
              : 'studio-recorder-floating-timeline'
        }
      >
        <RecordTimeline events={visibleEvents} />
      </div>
    </section>
  );
}

function RecorderFloatingOutputs({
  generatedMarkdown,
  isMarkdownGenerating,
  markdownOutputLabel,
  onExportMarkdown,
  onReplayMarkdown,
  recorderPanelSession,
}: {
  generatedMarkdown: string;
  isMarkdownGenerating: boolean;
  markdownOutputLabel: string;
  onExportMarkdown: () => void;
  onReplayMarkdown?: () => void;
  recorderPanelSession: StudioRecordingSession | null;
}) {
  if (isMarkdownGenerating) {
    return (
      <button
        className="studio-recorder-floating-output studio-recorder-floating-output-generating"
        disabled
        type="button"
      >
        <RecorderOutputIcon />
        <span>Generating markdown...</span>
      </button>
    );
  }

  if (generatedMarkdown && recorderPanelSession) {
    return (
      <div className="studio-recorder-floating-output">
        <div className="studio-recorder-floating-output-info">
          <RecorderOutputIcon />
          <span>{markdownOutputLabel}</span>
        </div>
        <div className="studio-recorder-floating-output-actions">
          {onReplayMarkdown ? (
            <Tooltip
              overlayClassName="studio-recorder-output-tooltip"
              placement="bottom"
              title="Replay"
            >
              <button
                aria-label="Replay Markdown output"
                className="studio-recorder-floating-output-action"
                onClick={onReplayMarkdown}
                type="button"
              >
                <ReplayIcon />
              </button>
            </Tooltip>
          ) : null}
          <button
            aria-label="Download Markdown output"
            className="studio-recorder-floating-output-action"
            onClick={onExportMarkdown}
            title="Download"
            type="button"
          >
            <DownloadIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="studio-recorder-floating-output-empty">No outputs yet</div>
  );
}

export function RecorderFloatingPanel({
  canStartRecording,
  detailView,
  error,
  generatedMarkdown,
  historyControl,
  isMarkdownGenerating,
  isRecording,
  isStoppingRecording,
  markdownOutputLabel,
  onExportMarkdown,
  onReplayMarkdown,
  onToggleAllTimelineEvents,
  onToggleCollapsed,
  onToggleRecording,
  recorderPanelEvents,
  recorderPanelSession,
  showAllTimelineEvents,
  showCollapsed,
  showExpandedDetail,
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
  const cardClassName = [
    'studio-recorder-floating-card',
    showCollapsed ? 'studio-recorder-floating-card-collapsed' : '',
    showAllTimelineEvents && !showExpandedDetail && !showCollapsed
      ? 'studio-recorder-floating-card-expanded'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const mainClassName = [
    'studio-recorder-floating-main',
    showCollapsed ? 'studio-recorder-floating-main-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const outputsClassName = [
    'studio-recorder-floating-outputs',
    showCollapsed || showExpandedDetail
      ? 'studio-recorder-floating-outputs-hidden'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="studio-recorder-panel">
      {error ? <div className="studio-recorder-notice">{error}</div> : null}

      <div className={cardClassName}>
        <header
          className={
            showCollapsed
              ? 'studio-recorder-floating-header studio-recorder-floating-header-collapsed'
              : 'studio-recorder-floating-header'
          }
        >
          <div className="studio-recorder-floating-title">
            <RecorderPanelIcon />
            <span>Record and replay</span>
          </div>
          <div className="studio-recorder-floating-actions">
            {showCollapsed && showRecordingVisual ? (
              <span
                aria-label="Recording"
                className="studio-recorder-floating-status studio-recorder-floating-status-running"
                title="Recording"
              />
            ) : null}
            <button
              aria-label={
                showCollapsed
                  ? 'Expand recorder panel'
                  : 'Collapse recorder panel'
              }
              aria-pressed={showCollapsed}
              className={
                showCollapsed
                  ? 'studio-recorder-floating-tool-button studio-recorder-floating-tool-button-active'
                  : 'studio-recorder-floating-tool-button'
              }
              onClick={onToggleCollapsed}
              title={
                showCollapsed
                  ? 'Expand recorder panel'
                  : 'Collapse recorder panel'
              }
              type="button"
            >
              <span className="studio-recorder-floating-fold-icon" />
            </button>
            {historyControl}
            <button
              aria-label={recordingButtonLabel}
              className={
                showRecordingVisual
                  ? 'studio-recorder-floating-record-button studio-recorder-floating-record-button-active'
                  : 'studio-recorder-floating-record-button'
              }
              disabled={
                isStoppingRecording || (!isRecording && !canStartRecording)
              }
              onClick={onToggleRecording}
              title={recordingButtonTitle}
              type="button"
            >
              {showRecordingVisual ? (
                <img
                  alt=""
                  className="studio-recorder-floating-record-button-icon"
                  draggable={false}
                  src={recordingButtonIconUrl}
                />
              ) : (
                <RecorderButtonIcon />
              )}
            </button>
          </div>
        </header>

        <div aria-hidden={showCollapsed} className={mainClassName}>
          <div className="studio-recorder-floating-main-content">
            {showExpandedDetail ? (
              detailView
            ) : (
              <RecorderFloatingTimeline
                events={recorderPanelEvents}
                isRecording={showRecordingVisual}
                onToggleAllTimelineEvents={onToggleAllTimelineEvents}
                showAllTimelineEvents={showAllTimelineEvents}
              />
            )}
          </div>
        </div>

        <footer
          aria-hidden={showCollapsed || showExpandedDetail}
          className={outputsClassName}
        >
          <div className="studio-recorder-floating-outputs-title">
            <span>Outputs</span>
          </div>
          <RecorderFloatingOutputs
            generatedMarkdown={generatedMarkdown}
            isMarkdownGenerating={isMarkdownGenerating}
            markdownOutputLabel={markdownOutputLabel}
            onExportMarkdown={onExportMarkdown}
            onReplayMarkdown={onReplayMarkdown}
            recorderPanelSession={recorderPanelSession}
          />
        </footer>
      </div>
    </div>
  );
}
