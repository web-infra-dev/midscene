import type { ExternalRunRequest } from '@midscene/visualizer';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import { createStudioRecorderTargetSignature } from '../../recorder/selectors';
import { StudioModeTab } from '../../recorder/types';
import { useStudioRecorder } from '../../recorder/useStudioRecorder';
import { PlaygroundShell } from '../PlaygroundShell';
import {
  StudioTimelineEmptyState,
  StudioTimelinePanel,
} from '../StudioTimelinePanel';
import {
  StudioPlaygroundExecution,
  createStudioPlaygroundConfig,
  createStudioPlaygroundStorageNamespace,
} from './StudioPlaygroundExecution';
import './studio-playground-panel.css';

export {
  createStudioPlaygroundConfig,
  createStudioPlaygroundStorageNamespace,
} from './StudioPlaygroundExecution';

interface PlaygroundProps {
  externalRunRequest?: ExternalRunRequest | null;
  inputActions?: ReactNode;
  onHeaderChange?: (header: {
    title: ReactNode;
    actions?: ReactNode;
  }) => void;
  playground?: ReturnType<typeof useStudioPlayground>;
}

export default function Playground({
  externalRunRequest,
  inputActions,
  onHeaderChange,
  playground,
}: PlaygroundProps) {
  const hookPlayground = useStudioPlayground();
  const studioPlayground = playground ?? hookPlayground;
  const recorder = useStudioRecorder();
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const currentTargetSignature = useMemo(
    () => createStudioRecorderTargetSignature(recorder.currentTarget),
    [recorder.currentTarget],
  );
  const storageNamespace = useMemo(
    () => createStudioPlaygroundStorageNamespace(currentTargetSignature),
    [currentTargetSignature],
  );
  const playgroundConfig = useMemo(
    () =>
      createStudioPlaygroundConfig({
        emptyState: (
          <StudioTimelineEmptyState
            description="The mission progress will be displayed here."
            title="No execution yet"
            variant={StudioModeTab.Playground}
          />
        ),
        externalRunRequest,
        inputActions,
        showClearButton: true,
        storageNamespace,
        timelineWrapper: (content, state) => (
          <StudioTimelinePanel
            ariaHidden={timelineCollapsed}
            className="studio-playground-timeline-panel"
            collapsed={timelineCollapsed}
            contentClassName="studio-playground-timeline-panel-body"
            empty={state.empty}
            expanded={!state.empty}
            onToggleCollapsed={() => {
              setTimelineCollapsed((collapsed) => !collapsed);
            }}
            scrollBody={!state.empty}
            variant={StudioModeTab.Playground}
          >
            {content}
          </StudioTimelinePanel>
        ),
      }),
    [externalRunRequest, inputActions, storageNamespace, timelineCollapsed],
  );
  const renderOwnHeader = !onHeaderChange;

  useEffect(() => {
    onHeaderChange?.({ title: 'API Playground' });
  }, [onHeaderChange]);

  return (
    <PlaygroundShell showHeader={renderOwnHeader} title="API Playground">
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
          <StudioPlaygroundExecution
            className="h-full"
            controller={studioPlayground.controller}
            playgroundClassName={[
              'studio-playground-execution',
              'studio-playground-input-first',
              'studio-playground-timeline-wrapped',
              timelineCollapsed ? 'studio-playground-timeline-collapsed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            playgroundConfig={playgroundConfig}
            title="Playground"
          />
        )}
      </div>
    </PlaygroundShell>
  );
}
