import { useTextTruncation } from '@midscene/visualizer';
import type { StudioRecordingSession } from '../../recorder/types';
import { StudioActionMenu } from '../StudioActionMenu';
import { DownloadIcon, TrashIcon } from './assets/recorder-icons';
import './studio-recorder-panel.css';

interface StudioReplayPanelProps {
  activeSessionId?: string | null;
  activeSessionStoppable?: boolean;
  onDeleteSession?: (session: StudioRecordingSession) => void | Promise<void>;
  onDownloadSession?: (session: StudioRecordingSession) => void;
  onReplaySession: (session: StudioRecordingSession) => void;
  onSelectSession: (session: StudioRecordingSession) => void;
  onStopActiveSession?: () => void;
  selectedSessionId?: string | null;
  sessions: StudioRecordingSession[];
}

function ReplayPanelFileIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M3.33333 1.33333H10L13.3333 4.66667V14C13.3333 14.3682 13.0349 14.6667 12.6667 14.6667H3.33333C2.96514 14.6667 2.66667 14.3682 2.66667 14V2C2.66667 1.63181 2.96514 1.33333 3.33333 1.33333Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.333"
      />
      <path
        d="M6.33333 9.33333H9.66667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.333"
      />
      <path
        d="M9.66667 6.66667H6.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.333"
      />
    </svg>
  );
}

function ReplayPanelPlayIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="M3.6 8V2.5L8.363 5.25L13.126 8L8.363 10.75L3.6 13.5V8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function ReplayPanelLoadingIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1.2"
      />
      <path
        d="M14 8A6 6 0 0 0 8 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function ReplayPanelStopIcon() {
  return <span aria-hidden="true" className="studio-replay-panel-stop-icon" />;
}

function ReplayPanelMoreActions({
  onDeleteSession,
  onDownloadSession,
  session,
}: {
  onDeleteSession?: (session: StudioRecordingSession) => void | Promise<void>;
  onDownloadSession?: (session: StudioRecordingSession) => void;
  session: StudioRecordingSession;
}) {
  if (!onDownloadSession && !onDeleteSession) {
    return null;
  }

  return (
    <div className="studio-replay-panel-actions">
      <StudioActionMenu
        ariaLabel={`More actions for ${session.name}`}
        items={[
          ...(onDownloadSession
            ? [
                {
                  icon: <DownloadIcon />,
                  label: 'Download',
                  onClick: () => onDownloadSession(session),
                },
              ]
            : []),
          ...(onDeleteSession
            ? [
                {
                  danger: true,
                  icon: <TrashIcon />,
                  label: 'Delete',
                  onClick: () => onDeleteSession(session),
                },
              ]
            : []),
        ]}
        triggerClassName="studio-replay-panel-more-button"
      />
    </div>
  );
}

function ReplayPanelSessionItem({
  activeSessionStoppable,
  isActive,
  isSelected,
  onDeleteSession,
  onDownloadSession,
  onReplaySession,
  onSelectSession,
  onStopActiveSession,
  session,
}: {
  activeSessionStoppable: boolean;
  isActive: boolean;
  isSelected: boolean;
  onDeleteSession?: (session: StudioRecordingSession) => void;
  onDownloadSession?: (session: StudioRecordingSession) => void;
  onReplaySession: (session: StudioRecordingSession) => void;
  onSelectSession: (session: StudioRecordingSession) => void;
  onStopActiveSession?: () => void;
  session: StudioRecordingSession;
}) {
  const { ref, truncated } = useTextTruncation<HTMLSpanElement>(
    session.name,
    'single-line',
  );

  return (
    <div
      className={
        isActive
          ? 'studio-replay-panel-item studio-replay-panel-item-active'
          : isSelected
            ? 'studio-replay-panel-item studio-replay-panel-item-selected'
            : 'studio-replay-panel-item'
      }
      onClick={() => {
        onSelectSession(session);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectSession(session);
        }
      }}
      // biome-ignore lint/a11y/useSemanticElements: the row contains a nested menu button, so a native button would create invalid nested controls.
      role="button"
      tabIndex={0}
      title={truncated ? session.name : undefined}
    >
      <ReplayPanelFileIcon />
      <span ref={ref}>{session.name}</span>
      <ReplayPanelMoreActions
        onDeleteSession={onDeleteSession}
        onDownloadSession={onDownloadSession}
        session={session}
      />
      {isActive && activeSessionStoppable ? (
        <button
          aria-label={`Stop replay for ${session.name}`}
          className="studio-replay-panel-stop-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onStopActiveSession?.();
          }}
          type="button"
        >
          <ReplayPanelStopIcon />
        </button>
      ) : isActive ? (
        <span className="studio-replay-panel-loading">
          <ReplayPanelLoadingIcon />
        </span>
      ) : (
        <button
          aria-label={`Replay ${session.name}`}
          className="studio-replay-panel-play-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onReplaySession(session);
          }}
          type="button"
        >
          <ReplayPanelPlayIcon />
        </button>
      )}
    </div>
  );
}

export function StudioReplayPanel({
  activeSessionId,
  activeSessionStoppable = false,
  onDeleteSession,
  onDownloadSession,
  onReplaySession,
  onSelectSession,
  onStopActiveSession,
  selectedSessionId,
  sessions,
}: StudioReplayPanelProps) {
  return (
    <section className="studio-replay-panel">
      <header className="studio-replay-panel-header">
        <div className="studio-replay-panel-title">Replay</div>
      </header>
      <div className="studio-replay-panel-body">
        {sessions.length > 0 ? (
          <div className="studio-replay-panel-list">
            {sessions.map((session) => {
              const isActive = activeSessionId === session.id;
              const isSelected = selectedSessionId === session.id;
              return (
                <ReplayPanelSessionItem
                  activeSessionStoppable={activeSessionStoppable}
                  isActive={isActive}
                  isSelected={isSelected}
                  key={session.id}
                  onDeleteSession={onDeleteSession}
                  onDownloadSession={onDownloadSession}
                  onReplaySession={onReplaySession}
                  onSelectSession={onSelectSession}
                  onStopActiveSession={onStopActiveSession}
                  session={session}
                />
              );
            })}
          </div>
        ) : (
          <div className="studio-replay-panel-empty">
            <div className="studio-replay-panel-empty-title">
              No recording history available yet
            </div>
            <div className="studio-replay-panel-empty-description">
              Generate Markdown from a completed recording to add it here.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
