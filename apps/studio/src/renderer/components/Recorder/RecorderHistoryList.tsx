import { HistorySelector } from '@midscene/visualizer/history-selector';
import { Popover } from 'antd';
import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { StudioRecordingSession } from '../../recorder/types';
import { DownloadIcon, EditIcon, TrashIcon } from './assets/recorder-icons';
import type { StudioRecorderTab } from './recorder-panel-utils';

const RECORDER_HISTORY_TYPE = 'studio-recorder';
type HistorySelectorHistory = Parameters<
  ComponentProps<typeof HistorySelector>['onSelect']
>[0];
type HistorySelectorWithActionControlsProps = Omit<
  ComponentProps<typeof HistorySelector>,
  'renderItemActions'
> & {
  renderItemActions?: (
    history: HistorySelectorHistory,
    controls: { close: () => void; scrollVersion: number },
  ) => ReactNode;
};
const RecorderHistorySelector =
  HistorySelector as ComponentType<HistorySelectorWithActionControlsProps>;

interface RecorderHistoryListProps {
  currentSessionId?: string;
  isRecording: boolean;
  onDeleteSession: (sessionId: string) => void;
  onExportMarkdown: (sessionId: string) => void;
  onOpenDetail: (sessionId: string, tab?: StudioRecorderTab) => void;
  sessions: StudioRecordingSession[];
  trigger: ReactNode;
}

function RecorderHistoryActions({
  currentSessionId,
  isRecording,
  onDeleteSession,
  onExportMarkdown,
  onOpenDetail,
  onCloseHistory,
  scrollVersion,
  session,
}: Omit<RecorderHistoryListProps, 'sessions' | 'trigger'> & {
  onCloseHistory: () => void;
  scrollVersion: number;
  session: StudioRecordingSession;
}) {
  const [open, setOpen] = useState(false);
  const deleteDisabled = isRecording && session.id === currentSessionId;
  const hasAiMarkdown = Boolean(session.generatedCode?.markdown);

  useEffect(() => {
    if (scrollVersion > 0) {
      setOpen(false);
    }
  }, [scrollVersion]);

  return (
    <Popover
      content={
        <div className="studio-recorder-history-actions-menu">
          <button
            disabled={!hasAiMarkdown}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onExportMarkdown(session.id);
            }}
            title={
              hasAiMarkdown
                ? 'Download Markdown replay'
                : 'Generate AI Markdown before downloading'
            }
            type="button"
          >
            <DownloadIcon />
            <span>download</span>
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onCloseHistory();
              onOpenDetail(session.id, 'timeline');
            }}
            type="button"
          >
            <EditIcon />
            <span>edit</span>
          </button>
          <button
            disabled={deleteDisabled}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onDeleteSession(session.id);
            }}
            type="button"
          >
            <TrashIcon />
            <span>delete</span>
          </button>
        </div>
      }
      onOpenChange={setOpen}
      open={open}
      overlayClassName="studio-recorder-history-actions-popover"
      placement="bottomRight"
      trigger="click"
    >
      <button
        aria-label={`More actions for ${session.name}`}
        className="studio-recorder-history-action-trigger"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        type="button"
      >
        ...
      </button>
    </Popover>
  );
}

export function RecorderHistoryList({
  currentSessionId,
  isRecording,
  onDeleteSession,
  onExportMarkdown,
  onOpenDetail,
  sessions,
  trigger,
}: RecorderHistoryListProps) {
  const sessionById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  );
  const historyItems = useMemo(
    () =>
      sessions.map((session) => ({
        params: { sessionId: session.id },
        prompt: session.name,
        timestamp: session.createdAt,
        type: RECORDER_HISTORY_TYPE,
      })),
    [sessions],
  );

  return (
    <RecorderHistorySelector
      currentType={RECORDER_HISTORY_TYPE}
      emptyText="No recordings yet"
      history={historyItems}
      noMatchText="No matching recording"
      onSelect={(history) => {
        const sessionId = history.params?.sessionId;
        if (typeof sessionId === 'string') {
          onOpenDetail(sessionId, 'timeline');
        }
      }}
      overlayClassName="studio-recorder-history-modal-overlay"
      popupHeight={305}
      popupPlacement="bottom"
      popupWidth={280}
      portalContainerSelector=".studio-recorder-floating-card"
      renderItemActions={(history, { close, scrollVersion }) => {
        const sessionId = history.params?.sessionId;
        const session =
          typeof sessionId === 'string' ? sessionById.get(sessionId) : null;
        if (!session) {
          return null;
        }
        return (
          <RecorderHistoryActions
            currentSessionId={currentSessionId}
            isRecording={isRecording}
            onDeleteSession={onDeleteSession}
            onExportMarkdown={onExportMarkdown}
            onCloseHistory={close}
            onOpenDetail={onOpenDetail}
            scrollVersion={scrollVersion}
            session={session}
          />
        );
      }}
      searchPlaceholder="search"
      showClear={false}
      title="History"
      trigger={trigger}
    />
  );
}
