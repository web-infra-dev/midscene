import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StudioRecordingSession } from '../../recorder/types';
import { DownloadIcon, TrashIcon } from './assets/recorder-icons';
import './studio-recorder-panel.css';

interface StudioReplayPanelProps {
  activeSessionId?: string | null;
  onDeleteSession?: (session: StudioRecordingSession) => void;
  onDownloadSession?: (session: StudioRecordingSession) => void;
  onReplaySession: (session: StudioRecordingSession) => void;
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

function ReplayPanelMoreIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <circle cx="3.5" cy="8" fill="currentColor" r="1" />
      <circle cx="8" cy="8" fill="currentColor" r="1" />
      <circle cx="12.5" cy="8" fill="currentColor" r="1" />
    </svg>
  );
}

function ReplayPanelMoreActions({
  onDeleteSession,
  onDownloadSession,
  session,
}: {
  onDeleteSession?: (session: StudioRecordingSession) => void;
  onDownloadSession?: (session: StudioRecordingSession) => void;
  session: StudioRecordingSession;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updateMenuPosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }
      setMenuPosition({
        left: triggerRect.right - 126,
        top: triggerRect.bottom + 8,
      });
    };

    const handleOutsidePointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };

    updateMenuPosition();
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    document.addEventListener('mousedown', handleOutsidePointerDown, true);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointerDown,
        true,
      );
      document.removeEventListener('mousedown', handleOutsidePointerDown, true);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
    }
  }, [open]);

  const openMenu = () => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (triggerRect) {
      setMenuPosition({
        left: triggerRect.right - 126,
        top: triggerRect.bottom + 8,
      });
    }
    setOpen(true);
  };

  const actionsMenu =
    open && menuPosition
      ? createPortal(
          <div
            className="studio-replay-panel-actions-menu"
            ref={menuRef}
            role="menu"
            style={{
              left: menuPosition.left,
              top: menuPosition.top,
            }}
          >
            {onDownloadSession ? (
              <button
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onDownloadSession(session);
                }}
                type="button"
              >
                <DownloadIcon />
                <span>Download</span>
              </button>
            ) : null}
            {onDeleteSession ? (
              <button
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  onDeleteSession(session);
                }}
                type="button"
              >
                <TrashIcon />
                <span>Delete</span>
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  useEffect(() => {
    if (!onDownloadSession && !onDeleteSession) {
      setOpen(false);
    }
  }, [onDeleteSession, onDownloadSession]);

  if (!onDownloadSession && !onDeleteSession) {
    return null;
  }

  return (
    <div className="studio-replay-panel-actions">
      <button
        aria-label={`More actions for ${session.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="studio-replay-panel-more-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <ReplayPanelMoreIcon />
      </button>
      {actionsMenu}
    </div>
  );
}

export function StudioReplayPanel({
  activeSessionId,
  onDeleteSession,
  onDownloadSession,
  onReplaySession,
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
              return (
                <div
                  className={
                    isActive
                      ? 'studio-replay-panel-item studio-replay-panel-item-active'
                      : 'studio-replay-panel-item'
                  }
                  key={session.id}
                  onClick={() => {
                    onReplaySession(session);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onReplaySession(session);
                    }
                  }}
                  // biome-ignore lint/a11y/useSemanticElements: the row contains a nested menu button, so a native button would create invalid nested controls.
                  role="button"
                  tabIndex={0}
                  title={session.name}
                >
                  <ReplayPanelFileIcon />
                  <span>{session.name}</span>
                  {isActive ? null : (
                    <ReplayPanelMoreActions
                      onDeleteSession={onDeleteSession}
                      onDownloadSession={onDownloadSession}
                      session={session}
                    />
                  )}
                  {isActive ? (
                    <span className="studio-replay-panel-loading">
                      <ReplayPanelLoadingIcon />
                    </span>
                  ) : (
                    <ReplayPanelPlayIcon />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="studio-replay-panel-empty">
            <div className="studio-replay-panel-empty-title">
              No recording history available yet
            </div>
            <div className="studio-replay-panel-empty-description">
              After the recording task is completed, a playback will be
              generated here.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
