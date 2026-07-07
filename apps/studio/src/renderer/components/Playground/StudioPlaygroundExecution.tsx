import { PlaygroundConversationPanel } from '@midscene/playground-app';
import type {
  ExternalRunRequest,
  UniversalPlaygroundConfig,
} from '@midscene/visualizer';
import type { ReactNode } from 'react';
import { downloadStudioReport } from '../../playground/report-download';
import type { useStudioPlayground } from '../../playground/useStudioPlayground';
import './StudioExecutionEmptyState.css';

declare const __APP_VERSION__: string;

type StudioPlaygroundController = Extract<
  ReturnType<typeof useStudioPlayground>,
  { phase: 'ready' }
>['controller'];

type StudioPlaygroundConfig = Partial<UniversalPlaygroundConfig> & {
  hidePromptInput?: boolean;
  showClearButton?: boolean;
  showSessionSeparator?: boolean;
  suppressConfigErrorToast?: boolean;
  timelineHeader?: ReactNode;
  timelineWrapper?: (
    content: ReactNode,
    state: { empty: boolean },
  ) => ReactNode;
};

type StudioPromptInputChromeConfig = NonNullable<
  UniversalPlaygroundConfig['promptInputChrome']
> & {
  settingsPlacement?: 'toolbar' | 'input' | 'hidden';
};

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

function ExecutionEmptyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="studio-execution-empty-state-icon"
      fill="none"
      viewBox="0 0 48 48"
    >
      <rect
        height="26"
        rx="7"
        stroke="currentColor"
        strokeWidth="2.4"
        width="30"
        x="9"
        y="11"
      />
      <path
        d="M16 20h16M16 27h10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <path
        d="m32 32 5 5 7-10"
        stroke="#1677ff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
    </svg>
  );
}

function StudioExecutionEmptyState() {
  return (
    <div className="studio-execution-empty-state">
      <ExecutionEmptyIcon />
      <div className="studio-execution-empty-state-title">No execution yet</div>
      <div className="studio-execution-empty-state-description">
        The mission progress will be displayed here.
      </div>
    </div>
  );
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
    emptyState?: ReactNode;
    externalRunRequest?: ExternalRunRequest | null;
    hidePromptInput?: boolean;
    inputActions?: ReactNode;
    showClearButton?: boolean;
    showSessionSeparator?: boolean;
    storageNamespace?: string;
    suppressConfigErrorToast?: boolean;
    timelineHeader?: ReactNode;
    timelineWrapper?: (
      content: ReactNode,
      state: { empty: boolean },
    ) => ReactNode;
  } = {},
): StudioPlaygroundConfig {
  return {
    emptyState: options.emptyState ?? <StudioExecutionEmptyState />,
    externalRunRequest: options.externalRunRequest ?? null,
    hidePromptInput: options.hidePromptInput,
    onDownloadReport: downloadStudioReport,
    persistMessages: false,
    executionFlow: {
      collapsible: false,
    },
    promptInputChrome: {
      variant: 'default',
      settingsPlacement: 'input',
      inputActions: options.inputActions,
    } as StudioPromptInputChromeConfig,
    showClearButton: options.showClearButton ?? false,
    showSessionSeparator: options.showSessionSeparator,
    storageNamespace: options.storageNamespace,
    suppressConfigErrorToast: options.suppressConfigErrorToast,
    timelineHeader: options.timelineHeader,
    timelineWrapper: options.timelineWrapper,
  };
}

export function StudioPlaygroundExecution({
  className = '',
  controller,
  playgroundClassName,
  playgroundConfig,
  title,
}: {
  className?: string;
  controller: StudioPlaygroundController;
  playgroundClassName: string;
  playgroundConfig: StudioPlaygroundConfig;
  title: string;
}) {
  return (
    <PlaygroundConversationPanel
      appVersion={__APP_VERSION__}
      className={className || undefined}
      controller={controller}
      notConnectedFallback={<NotConnectedFallback />}
      playgroundClassName={playgroundClassName}
      playgroundConfig={playgroundConfig}
      title={title}
    />
  );
}
