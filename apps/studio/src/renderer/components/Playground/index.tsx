import { PlaygroundConversationPanel } from '@midscene/playground-app';
import type { UniversalPlaygroundConfig } from '@midscene/visualizer';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadStudioReport } from '../../playground/report-download';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import type { StudioRecorderPanelMode } from '../../recorder/types';
import { useStudioRecorder } from '../../recorder/useStudioRecorder';
import { PlaygroundShell } from '../PlaygroundShell';
import { StudioRecorderPanel } from '../Recorder/StudioRecorderPanel';
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
const RIGHT_PANEL_MODE_STORAGE_KEY = 'studio.rightPanelMode';

function PlaygroundModeIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path
        d="M4 5.5 19 12 4 18.5l3.2-6.5L4 5.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m7.5 12 5.8.02" strokeLinecap="round" />
    </svg>
  );
}

function RecorderModeIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth="1.8">
      <path
        d="M5 7.5h9.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m16.5 10.3 4-2.1v7.6l-4-2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function readPersistedRightPanelMode(): StudioRecorderPanelMode {
  if (typeof window === 'undefined') {
    return 'playground';
  }

  return window.localStorage.getItem(RIGHT_PANEL_MODE_STORAGE_KEY) ===
    'recorder'
    ? 'recorder'
    : 'playground';
}

export function createStudioPlaygroundConfig(): Partial<UniversalPlaygroundConfig> {
  return {
    emptyState: <StudioPlaygroundEmptyState />,
    onDownloadReport: downloadStudioReport,
    promptInputChrome: {
      variant: 'default',
    },
  };
}

export default function Playground() {
  const studioPlayground = useStudioPlayground();
  const recorder = useStudioRecorder();
  const stopRecording = recorder.stopRecording;
  const [rightPanelMode, setRightPanelMode] = useState<StudioRecorderPanelMode>(
    readPersistedRightPanelMode,
  );
  const playgroundConfig = useMemo(() => createStudioPlaygroundConfig(), []);
  const modeMenuItems = useMemo(
    () => [
      { key: 'playground', label: 'Playground', icon: <PlaygroundModeIcon /> },
      { key: 'recorder', label: 'Recorder', icon: <RecorderModeIcon /> },
    ],
    [],
  );
  const handleModeSelect = useCallback(
    (key: string) => {
      if (key !== 'playground' && key !== 'recorder') {
        return;
      }
      if (rightPanelMode === 'recorder' && key !== 'recorder') {
        void stopRecording();
      }
      setRightPanelMode(key);
      window.localStorage.setItem(RIGHT_PANEL_MODE_STORAGE_KEY, key);
    },
    [rightPanelMode, stopRecording],
  );

  useEffect(() => {
    return () => {
      void stopRecording();
    };
  }, [stopRecording]);

  return (
    <PlaygroundShell
      modeMenu={{
        items: modeMenuItems,
        onSelect: handleModeSelect,
        selectedKey: rightPanelMode,
      }}
    >
      <div className="min-h-0 h-full flex-1 overflow-hidden">
        {rightPanelMode === 'recorder' ? (
          <StudioRecorderPanel />
        ) : studioPlayground.phase === 'booting' ? (
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
