import {
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderSemantic,
} from '@midscene/shared/recorder';
import { useTextTruncation } from '@midscene/visualizer';
import { Tooltip } from 'antd';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
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
  CopyIcon,
  DownloadIcon,
  RecorderButtonIcon,
  RecorderGenerateNaturalLanguageIcon,
  RecorderOutputIcon,
  RecorderScreenshotIcon,
  ReloadIcon,
} from './assets/recorder-icons';

interface RecorderFloatingPanelProps {
  canStartRecording: boolean;
  canGenerateMarkdown: boolean;
  error?: string | null;
  isMarkdownGenerating: boolean;
  isKnowledgeGenerating: boolean;
  isRecording: boolean;
  isStoppingRecording: boolean;
  knowledgeError: string | null;
  knowledgeMarkdown: string;
  onCopyKnowledge: () => void;
  onExportKnowledge: (format: 'markdown' | 'json') => void;
  onGenerateMarkdown: () => void;
  onGenerateKnowledge: () => void;
  onOpenKnowledge: () => void;
  onRegenerateKnowledge: () => void;
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

function getStudioRecorderEventInlineScreenshot(event: StudioRecordedEvent) {
  return (
    event.screenshotWithBox || event.screenshotAfter || event.screenshotBefore
  );
}

function hasStudioRecorderEventScreenshots(events: StudioRecordedEvent[]) {
  return events.some((event) =>
    Boolean(
      getStudioRecorderEventInlineScreenshot(event) || event.screenshotAsset,
    ),
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
  isKnowledgeGenerating,
  knowledgeError,
  knowledgeMarkdown,
  onCopyKnowledge,
  onExportKnowledge,
  onGenerateMarkdown,
  onGenerateKnowledge,
  onOpenKnowledge,
  onRegenerateKnowledge,
  onShowScreenshots,
  recorderPanelSession,
}: {
  canGenerateMarkdown: boolean;
  canShowScreenshots: boolean;
  isMarkdownGenerating: boolean;
  isKnowledgeGenerating: boolean;
  knowledgeError: string | null;
  knowledgeMarkdown: string;
  onCopyKnowledge: () => void;
  onExportKnowledge: (format: 'markdown' | 'json') => void;
  onGenerateMarkdown: () => void;
  onGenerateKnowledge: () => void;
  onOpenKnowledge: () => void;
  onRegenerateKnowledge: () => void;
  onShowScreenshots: () => void;
  recorderPanelSession: StudioRecordingSession | null;
}) {
  const canGenerateKnowledge =
    recorderPanelSession?.status === 'completed' &&
    recorderPanelSession.events.length > 0;
  const knowledgeOutput = isKnowledgeGenerating ? (
    <button
      className="studio-recorder-floating-output studio-recorder-floating-output-generating"
      disabled
      type="button"
    >
      <RecorderOutputIcon />
      <span>Generating knowledge base...</span>
    </button>
  ) : knowledgeMarkdown && recorderPanelSession ? (
    <div className="studio-recorder-floating-output">
      <button
        className="studio-recorder-floating-output-info studio-recorder-floating-output-open"
        onClick={onOpenKnowledge}
        title="Open knowledge base"
        type="button"
      >
        <RecorderOutputIcon />
        <span>KNOWLEDGE.md</span>
      </button>
      <div className="studio-recorder-floating-output-actions studio-recorder-floating-output-actions-visible">
        <button
          aria-label="Copy knowledge base"
          className="studio-recorder-floating-output-action"
          onClick={onCopyKnowledge}
          title="Copy"
          type="button"
        >
          <CopyIcon />
        </button>
        <button
          aria-label="Regenerate knowledge base"
          className="studio-recorder-floating-output-action"
          onClick={onRegenerateKnowledge}
          title="Regenerate"
          type="button"
        >
          <ReloadIcon />
        </button>
        <button
          aria-label="Download knowledge base as Markdown"
          className="studio-recorder-floating-output-action"
          onClick={() => onExportKnowledge('markdown')}
          title="Download Markdown"
          type="button"
        >
          <DownloadIcon />
        </button>
        <button
          aria-label="Download knowledge base as JSON"
          className="studio-recorder-floating-output-action studio-recorder-floating-output-action-json"
          onClick={() => onExportKnowledge('json')}
          title="Download JSON"
          type="button"
        >
          <span>JSON</span>
        </button>
      </div>
    </div>
  ) : canGenerateKnowledge ? (
    <button
      className={
        knowledgeError
          ? 'studio-recorder-floating-generate-knowledge studio-recorder-floating-generate-knowledge-error'
          : 'studio-recorder-floating-generate-knowledge'
      }
      onClick={onGenerateKnowledge}
      title={knowledgeError || 'Generate knowledge base'}
      type="button"
    >
      <RecorderOutputIcon />
      <span>
        {knowledgeError
          ? 'Generation failed. Retry'
          : 'Generate knowledge base'}
      </span>
    </button>
  ) : null;

  let markdownOutput: ReactNode = null;

  if (isMarkdownGenerating) {
    markdownOutput = (
      <button
        aria-label="Generating Description"
        className="studio-recorder-floating-output studio-recorder-floating-output-generate studio-recorder-floating-output-generating"
        disabled
        type="button"
      >
        <RecorderGenerateNaturalLanguageIcon />
        <span data-text="Generating Description...">
          Generating Description...
        </span>
      </button>
    );
  } else if (canGenerateMarkdown && recorderPanelSession) {
    markdownOutput = (
      <button
        aria-label="Generate Description"
        className="studio-recorder-floating-output studio-recorder-floating-output-generate"
        onClick={onGenerateMarkdown}
        type="button"
      >
        <RecorderGenerateNaturalLanguageIcon />
        <span>Generate Description</span>
      </button>
    );
  }

  if (!knowledgeOutput && !markdownOutput && !canShowScreenshots) {
    return null;
  }

  return (
    <div className="studio-recorder-floating-output-stack">
      {knowledgeOutput}
      {markdownOutput}
      {canShowScreenshots && recorderPanelSession ? (
        <button
          aria-label="Show event screenshots"
          className="studio-recorder-floating-output studio-recorder-floating-output-generate"
          onClick={onShowScreenshots}
          type="button"
        >
          <RecorderScreenshotIcon />
          <span>Screenshots</span>
        </button>
      ) : null}
    </div>
  );
}

function toImagePreviewDataUrl(source: string): Promise<string> {
  if (source.startsWith('data:')) {
    return Promise.resolve(source);
  }
  return fetch(source)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Screenshot request failed (${response.status})`);
      }
      return await response.blob();
    })
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              resolve(reader.result);
              return;
            }
            reject(new Error('Screenshot preview data is unavailable.'));
          };
          reader.onerror = () =>
            reject(
              reader.error || new Error('Failed to read screenshot data.'),
            );
          reader.readAsDataURL(blob);
        }),
    );
}

function RecorderScreenshotCard({
  event,
  index,
  listRef,
  getScreenshotAssetUrl,
}: {
  event: StudioRecordedEvent;
  index: number;
  listRef: RefObject<HTMLDivElement | null>;
  getScreenshotAssetUrl: (assetId: string) => string | null;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const inlineScreenshot = getStudioRecorderEventInlineScreenshot(event);
  const assetUrl = event.screenshotAsset
    ? getScreenshotAssetUrl(event.screenshotAsset.id)
    : null;
  const [shouldLoadAsset, setShouldLoadAsset] = useState(
    Boolean(inlineScreenshot),
  );
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const title = getStudioTimelineEventTitle(event);
  const description = getStudioTimelineEventDescription(event);
  const screenshotFileName = formatStudioRecorderScreenshotEventName(
    event,
    index,
  );
  const imageSource = inlineScreenshot || (shouldLoadAsset ? assetUrl : null);

  useEffect(() => {
    if (inlineScreenshot || shouldLoadAsset) {
      return;
    }
    const card = cardRef.current;
    if (!card) {
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoadAsset(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadAsset(true);
          observer.disconnect();
        }
      },
      { root: listRef.current, rootMargin: '600px 0px' },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [inlineScreenshot, listRef, shouldLoadAsset]);

  useEffect(() => {
    setLoadError(false);
  }, [imageSource, loadAttempt]);

  return (
    <article className="studio-recorder-screenshot-card" ref={cardRef}>
      <div className="studio-recorder-screenshot-card-header">
        <span>#{index + 1}</span>
        <span>{screenshotFileName}</span>
      </div>
      <div className="studio-recorder-screenshot-card-body">
        {imageSource && !loadError ? (
          <button
            aria-label={`Open ${screenshotFileName} in system image viewer`}
            className="studio-recorder-screenshot-image-button"
            onClick={() => {
              void toImagePreviewDataUrl(imageSource)
                .then((data) =>
                  window.electronShell?.openImagePreview({
                    data,
                    fileName: `${screenshotFileName}.${event.screenshotAsset?.mimeType.includes('jpeg') ? 'jpg' : 'png'}`,
                  }),
                )
                .catch(() => setLoadError(true));
            }}
            title="Open with system image viewer"
            type="button"
          >
            <img
              alt={`${title}${description ? ` - ${description}` : ''}`}
              key={`${imageSource}:${loadAttempt}`}
              onError={() => setLoadError(true)}
              src={imageSource}
            />
          </button>
        ) : loadError || (shouldLoadAsset && !assetUrl) ? (
          <div className="studio-recorder-screenshot-state">
            <span>Screenshot unavailable</span>
            <button
              onClick={() => {
                setLoadError(false);
                setShouldLoadAsset(true);
                setLoadAttempt((attempt) => attempt + 1);
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : (
          <output className="studio-recorder-screenshot-state">
            Loading screenshot…
          </output>
        )}
      </div>
    </article>
  );
}

export function RecorderScreenshotDetailView({
  events,
  getScreenshotAssetUrl = () => null,
}: {
  events: StudioRecordedEvent[];
  getScreenshotAssetUrl?: (assetId: string) => string | null;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const screenshotEvents = events
    .map((event, index) => ({ event, index }))
    .filter(
      (
        item,
      ): item is {
        event: StudioRecordedEvent;
        index: number;
      } =>
        Boolean(
          getStudioRecorderEventInlineScreenshot(item.event) ||
            item.event.screenshotAsset,
        ),
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
        <div className="studio-recorder-screenshot-list" ref={listRef}>
          {screenshotEvents.map(({ event, index }, itemIndex) => (
            <RecorderScreenshotCard
              event={event}
              getScreenshotAssetUrl={getScreenshotAssetUrl}
              index={itemIndex}
              key={event.hashId ?? index}
              listRef={listRef}
            />
          ))}
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
  isKnowledgeGenerating,
  isRecording,
  isStoppingRecording,
  knowledgeError,
  knowledgeMarkdown,
  onCopyKnowledge,
  onExportKnowledge,
  onGenerateMarkdown,
  onGenerateKnowledge,
  onOpenKnowledge,
  onRegenerateKnowledge,
  onShowScreenshots,
  onToggleCollapsed,
  onToggleRecording,
  recorderPanelEvents,
  recorderPanelSession,
  showExpandedDetail,
  timelineCollapsed,
  statusText,
}: RecorderFloatingPanelProps) {
  const timelineScrollRef = useRef<HTMLDivElement>(null);
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
  const canGenerateKnowledge =
    recorderPanelSession?.status === 'completed' &&
    recorderPanelEvents.length > 0;
  const shouldShowOutputs =
    isKnowledgeGenerating ||
    canGenerateKnowledge ||
    isMarkdownGenerating ||
    canGenerateMarkdown ||
    (hasStudioRecorderEventScreenshots(recorderPanelEvents) && !isRecording);
  const shouldRenderTimelinePanel =
    !isTimelineEmpty || showExpandedDetail || shouldShowOutputs;

  useEffect(() => {
    if (timelineCollapsed || recorderPanelEvents.length === 0) {
      return;
    }

    const scrollToLatestEvent = () => {
      const timeline = timelineScrollRef.current;
      if (timeline) {
        timeline.scrollTop = timeline.scrollHeight;
      }
    };
    // The output footer animates in after recording stops. Scroll once after
    // the commit and again after the height transition so its buttons are not
    // left below the visible timeline area.
    const initialTimeoutId = window.setTimeout(scrollToLatestEvent);
    const settledTimeoutId = window.setTimeout(scrollToLatestEvent, 220);

    return () => {
      window.clearTimeout(initialTimeoutId);
      window.clearTimeout(settledTimeoutId);
    };
  }, [outputsClassName, recorderPanelEvents.length, timelineCollapsed]);

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
            <div className="studio-recorder-floating-primer-status">
              <span
                aria-hidden="true"
                className={
                  showRecordingVisual
                    ? 'studio-recorder-floating-recording-dot'
                    : 'studio-recorder-floating-ready-dot'
                }
              />
              <span className="studio-recorder-floating-primer-status-copy">
                {showRecordingVisual
                  ? 'Recording your actions'
                  : 'Record interactions,'}
              </span>
            </div>
            {!showRecordingVisual ? (
              <span className="studio-recorder-floating-primer-description">
                {' then generate a natural language description.'}
              </span>
            ) : null}
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
                isStoppingRecording ||
                (!isRecording && (!canStartRecording || isKnowledgeGenerating))
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
                {showRecordingVisual ? 'Stop Recording' : 'Start Recording'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {shouldRenderTimelinePanel ? (
        <StudioTimelinePanel
          ariaHidden={timelineCollapsed}
          bodyRef={timelineScrollRef}
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
                  isKnowledgeGenerating={isKnowledgeGenerating}
                  knowledgeError={knowledgeError}
                  knowledgeMarkdown={knowledgeMarkdown}
                  onCopyKnowledge={onCopyKnowledge}
                  onExportKnowledge={onExportKnowledge}
                  onGenerateMarkdown={onGenerateMarkdown}
                  onGenerateKnowledge={onGenerateKnowledge}
                  onOpenKnowledge={onOpenKnowledge}
                  onRegenerateKnowledge={onRegenerateKnowledge}
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
