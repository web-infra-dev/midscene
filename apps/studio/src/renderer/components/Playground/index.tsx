import { PlaygroundConversationPanel } from '@midscene/playground-app';
import type {
  ExternalRunRequest,
  FormValue,
  UniversalPlaygroundConfig,
} from '@midscene/visualizer';
import { Tooltip, message } from 'antd';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadStudioReport } from '../../playground/report-download';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import { isStudioRecorderEntryEnabled } from '../../recorder/feature-flag';
import { createRecorderMarkdownReplayRequest } from '../../recorder/replay';
import { createStudioRecorderTargetSignature } from '../../recorder/selectors';
import type {
  StudioRecorderPanelMode,
  StudioRecordingSession,
} from '../../recorder/types';
import { useStudioRecorder } from '../../recorder/useStudioRecorder';
import { PlaygroundShell } from '../PlaygroundShell';
import {
  ApiPlaygroundModeIcon,
  RecorderModeIcon,
} from '../PlaygroundShell/mode-icons';
import { StudioRecorderPanel } from '../Recorder';
import { StudioPlaygroundEmptyState } from './StudioPlaygroundEmptyState';

// Studio drives device selection from the Overview page (middle area), so the
// right column never hosts the SessionSetupPanel. This fallback replaces it
// with a calm "go to Overview" hint when no session is connected.
function NotConnectedFallback() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[8px] px-[24px] text-center">
      <div className="text-[14px] font-medium text-text-primary">
        No agent connected
      </div>
      <div className="text-[12px] leading-[20px] text-text-secondary">
        Create or pick a device from the Overview page to start a session.
      </div>
    </div>
  );
}

declare const __APP_VERSION__: string;
type StudioExternalRunRequest = ExternalRunRequest & {
  targetSignature: string | null;
};

interface PlaygroundProps {
  rightPanelMode: StudioRecorderPanelMode;
  onRightPanelModeChange: (mode: StudioRecorderPanelMode) => void;
}

function ImportReplayIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[16px] w-[16px]"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.6"
    >
      <path d="M12 4v10" stroke="currentColor" strokeLinecap="round" />
      <path
        d="m8 8 4-4 4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

function createExternalRunRequest(
  value: FormValue,
  displayContent: string,
  targetSignature: string | null,
): StudioExternalRunRequest {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    value,
    displayContent,
    targetSignature,
  };
}

export function createStudioPlaygroundStorageNamespace(
  targetSignature: string | null,
): string {
  return targetSignature
    ? `studio-playground-${encodeURIComponent(targetSignature)}`
    : 'studio-playground-unresolved-target';
}

export function createStudioPlaygroundConfig(
  options: {
    externalRunRequest?: ExternalRunRequest | null;
    importReplayAction?: ReactNode;
    storageNamespace?: string;
  } = {},
): Partial<UniversalPlaygroundConfig> {
  return {
    emptyState: <StudioPlaygroundEmptyState />,
    externalRunRequest: options.externalRunRequest ?? null,
    onDownloadReport: downloadStudioReport,
    persistMessages: false,
    showClearButton: true,
    storageNamespace: options.storageNamespace,
    promptInputChrome: {
      variant: 'default',
      inputActions: options.importReplayAction,
    },
  };
}

export default function Playground({
  onRightPanelModeChange,
  rightPanelMode,
}: PlaygroundProps) {
  const studioPlayground = useStudioPlayground();
  const recorder = useStudioRecorder();
  const recorderEntryEnabled = isStudioRecorderEntryEnabled();
  const stopRecording = recorder.stopRecording;
  const [externalRunRequest, setExternalRunRequest] =
    useState<StudioExternalRunRequest | null>(null);
  const currentTargetSignature = useMemo(
    () => createStudioRecorderTargetSignature(recorder.currentTarget),
    [recorder.currentTarget],
  );
  const showPlaygroundPanel = useCallback(() => {
    onRightPanelModeChange('playground');
  }, [onRightPanelModeChange]);
  const triggerExternalRun = useCallback(
    (value: FormValue, displayContent: string) => {
      showPlaygroundPanel();
      setExternalRunRequest(
        createExternalRunRequest(value, displayContent, currentTargetSignature),
      );
    },
    [currentTargetSignature, showPlaygroundPanel],
  );
  useEffect(() => {
    setExternalRunRequest(null);
  }, [currentTargetSignature]);
  const activeExternalRunRequest = useMemo(
    () =>
      currentTargetSignature &&
      externalRunRequest?.targetSignature === currentTargetSignature
        ? externalRunRequest
        : null,
    [currentTargetSignature, externalRunRequest],
  );
  const playgroundStorageNamespace = useMemo(
    () => createStudioPlaygroundStorageNamespace(currentTargetSignature),
    [currentTargetSignature],
  );
  const importReplayDisabledReason =
    studioPlayground.phase !== 'ready' ||
    !studioPlayground.controller.state.serverOnline ||
    !studioPlayground.controller.state.sessionViewState.connected
      ? 'Connect a target before replaying a file.'
      : null;
  const handleImportReplay = useCallback(async () => {
    try {
      if (importReplayDisabledReason) {
        message.info(importReplayDisabledReason);
        return;
      }
      if (!window.studioRuntime?.chooseReplayFile) {
        message.error('Studio replay file picker is unavailable.');
        return;
      }
      const replayFile = await window.studioRuntime.chooseReplayFile();
      if (!replayFile) {
        return;
      }
      if (replayFile.type === 'markdown') {
        triggerExternalRun(
          { type: 'runMarkdown', prompt: replayFile.path },
          `Imported Markdown Replay: ${replayFile.displayName}`,
        );
        return;
      }
      triggerExternalRun(
        { type: 'runYaml', prompt: replayFile.content },
        `Imported YAML Replay: ${replayFile.displayName}`,
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, [importReplayDisabledReason, triggerExternalRun]);
  const handleReplayRecorderMarkdown = useCallback(
    async (session: StudioRecordingSession) => {
      try {
        if (importReplayDisabledReason) {
          message.info(importReplayDisabledReason);
          return;
        }
        if (recorder.state.isRecording) {
          throw new Error('Stop recording before replay.');
        }
        if (!currentTargetSignature) {
          throw new Error('Connect a target before replay.');
        }
        if (
          createStudioRecorderTargetSignature(session.target) !==
          currentTargetSignature
        ) {
          throw new Error('Connect the recorded target before replay.');
        }
        if (!window.studioRuntime?.prepareRecorderMarkdownReplay) {
          message.error('Studio replay preparation is unavailable.');
          return;
        }
        const replayBundle =
          await window.studioRuntime.prepareRecorderMarkdownReplay(
            createRecorderMarkdownReplayRequest(session),
          );
        triggerExternalRun(
          { type: 'runMarkdown', prompt: replayBundle.markdownPath },
          `Recorder Markdown Replay: ${session.name}`,
        );
      } catch (error) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    },
    [
      currentTargetSignature,
      importReplayDisabledReason,
      recorder.state.isRecording,
      triggerExternalRun,
    ],
  );
  const importReplayAction = useMemo(
    () =>
      recorderEntryEnabled ? (
        <Tooltip
          placement="top"
          title={importReplayDisabledReason || 'Import Markdown or YAML replay'}
        >
          <span className="inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center leading-none">
            <button
              aria-label="Import Markdown or YAML replay"
              className="inline-flex h-[32px] w-[32px] min-w-[32px] items-center justify-center rounded-full border border-border-subtle bg-surface p-[7px] leading-none text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45"
              disabled={Boolean(importReplayDisabledReason)}
              onClick={handleImportReplay}
              type="button"
            >
              <ImportReplayIcon />
            </button>
          </span>
        </Tooltip>
      ) : null,
    [handleImportReplay, importReplayDisabledReason, recorderEntryEnabled],
  );
  const playgroundConfig = useMemo(
    () =>
      createStudioPlaygroundConfig({
        externalRunRequest: activeExternalRunRequest,
        importReplayAction,
        storageNamespace: playgroundStorageNamespace,
      }),
    [activeExternalRunRequest, importReplayAction, playgroundStorageNamespace],
  );
  const modeMenuItems = useMemo(
    () =>
      recorderEntryEnabled
        ? [
            {
              key: 'playground',
              label: 'API Playground',
              icon: <ApiPlaygroundModeIcon />,
            },
            { key: 'recorder', label: 'Recorder', icon: <RecorderModeIcon /> },
          ]
        : [],
    [recorderEntryEnabled],
  );
  useEffect(() => {
    if (!recorderEntryEnabled && rightPanelMode === 'recorder') {
      onRightPanelModeChange('playground');
      void stopRecording();
    }
  }, [
    onRightPanelModeChange,
    recorderEntryEnabled,
    rightPanelMode,
    stopRecording,
  ]);

  useEffect(() => {
    if (rightPanelMode !== 'recorder') {
      void stopRecording();
    }
  }, [rightPanelMode, stopRecording]);

  useEffect(() => {
    return () => {
      void stopRecording();
    };
  }, [stopRecording]);

  if (recorderEntryEnabled && rightPanelMode === 'recorder') {
    return (
      <div className="min-h-0 h-full flex-1 overflow-visible bg-transparent">
        <StudioRecorderPanel onReplayMarkdown={handleReplayRecorderMarkdown} />
      </div>
    );
  }

  return (
    <PlaygroundShell
      modeMenu={
        recorderEntryEnabled
          ? {
              items: modeMenuItems,
              selectedKey: rightPanelMode,
            }
          : undefined
      }
    >
      <div className="min-h-0 h-full flex-1 overflow-hidden">
        {studioPlayground.phase === 'booting' ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[14px] leading-[22px] text-text-tertiary">
            Playground starting...
          </div>
        ) : studioPlayground.phase === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-[14px] leading-[22px] text-text-secondary">
              {studioPlayground.error}
            </div>
            <button
              className="rounded-lg border border-border-subtle px-4 py-2 text-[13px] font-medium text-text-primary"
              onClick={() => {
                void studioPlayground.restartPlayground();
              }}
              type="button"
            >
              Retry runtime
            </button>
          </div>
        ) : (
          <PlaygroundConversationPanel
            appVersion={__APP_VERSION__}
            className="h-full"
            controller={studioPlayground.controller}
            notConnectedFallback={<NotConnectedFallback />}
            playgroundConfig={playgroundConfig}
            title="Playground"
          />
        )}
      </div>
    </PlaygroundShell>
  );
}
