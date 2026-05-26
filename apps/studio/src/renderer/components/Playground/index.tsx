import { PlaygroundConversationPanel } from '@midscene/playground-app';
import type { UniversalPlaygroundConfig } from '@midscene/visualizer';
import { useMemo } from 'react';
import { downloadStudioReport } from '../../playground/report-download';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import { PlaygroundShell } from '../PlaygroundShell';
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
  const playgroundConfig = useMemo(() => createStudioPlaygroundConfig(), []);

  return (
    <PlaygroundShell>
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
