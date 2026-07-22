import { getDebug } from '@midscene/shared/logger';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { StudioPlatformId } from '../../../shared/electron-contract';
import { STUDIO_EXTERNAL_LINKS } from '../../../shared/external-links';
import {
  SIDEBAR_TOGGLE_TOP,
  TITLEBAR_CONTROL_TOP,
  getRendererTitlebarRightInset,
} from '../../../shared/titlebar-layout';
import type { UpdateStatus } from '../../../shared/updater-contract';
import { assetUrls } from '../../assets';
import { useStudioUpdater } from '../../hooks/useStudioUpdater';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import { type StudioMode, StudioModeTab } from '../../recorder/types';
import MainContent from '../MainContent';
import SettingsPanel from '../SettingsPanel';
import Sidebar, { SidebarFooter } from '../Sidebar';
import {
  StudioRightPanel,
  type StudioRightPanelView,
  StudioRightPanelViewType,
  getStudioRightPanelWidth,
} from '../StudioRightPanel';
import { ModelEnvConfigModal } from './ModelEnvConfigModal';
import { loadAgentOptions, saveAgentOptions } from './agent-options-storage';
import { hasCompleteModelEnvConfig } from './connectivity-env';
import { loadModelEnvText, saveModelEnvText } from './model-env-storage';
import type { ShellActiveView } from './types';

export type { ShellActiveView };

const SIDEBAR_WIDTH_STORAGE_KEY = 'studio.sidebarWidth';

const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 400;

const SIDEBAR_COLLAPSED_WIDTH = 0;
const COLLAPSED_TITLEBAR_INSET = 280;
const SIDEBAR_TOGGLE_LEFT = 98;
const SIDEBAR_TRANSITION_CLASS = 'duration-200 ease-[cubic-bezier(0.2,0,0,1)]';
const STUDIO_RIGHT_PANEL_ANIMATION_MS = 160;
const debugAgentOptions = getDebug('studio:agent-options', { console: true });

const requireElectronShell = () => {
  if (!window.electronShell) {
    throw new Error('Electron shell bridge is unavailable.');
  }

  return window.electronShell;
};

function readPersistedWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function SidebarCollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-[14px] w-[16px]"
      src={collapsed ? assetUrls.sidebar.expand : assetUrls.sidebar.collapse}
    />
  );
}

function formatUpdatePercent(percent: number): string {
  return `${Math.min(100, Math.max(0, Math.round(percent)))}%`;
}

function UpdatePill({
  onDownload,
  onInstall,
  onOpenDownloadPage,
  status,
}: {
  onDownload: () => void;
  onInstall: () => void;
  onOpenDownloadPage?: () => void;
  status: UpdateStatus;
}) {
  if (
    status.state !== 'available' &&
    status.state !== 'downloading' &&
    status.state !== 'downloaded'
  ) {
    return null;
  }

  const isDownloading = status.state === 'downloading';
  const label = isDownloading
    ? formatUpdatePercent(status.percent)
    : status.state === 'downloaded'
      ? 'Restart'
      : 'Update';
  const title =
    status.state === 'downloaded'
      ? 'Restart to install update'
      : isDownloading
        ? `Downloading update ${label}`
        : 'Update available';

  return (
    <button
      aria-label={title}
      className="app-no-drag box-border inline-flex h-[22px] items-center gap-[4px] rounded-[40px] border-0 bg-[#DEEBEC] px-[5px] py-[3px] font-sans text-[11px] font-medium leading-[12px] text-[#1A79FF]"
      disabled={isDownloading}
      onClick={() => {
        if (status.state === 'available') {
          if (status.externalDownloadOnly && onOpenDownloadPage) {
            onOpenDownloadPage();
            return;
          }
          onDownload();
          return;
        }
        if (status.state === 'downloaded') {
          onInstall();
        }
      }}
      title={title}
      type="button"
    >
      <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-[#1A79FF] text-white">
        <svg
          aria-hidden="true"
          fill="none"
          height="11"
          viewBox="0 0 11 11"
          width="11"
        >
          <path
            d="M5.5 1.8v6.1M3 5.5l2.5 2.5L8 5.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      </span>
      <span className="h-[12px] overflow-hidden whitespace-nowrap text-left">
        {label}
      </span>
    </button>
  );
}

export default function ShellLayout() {
  const titlebarInsetRight = getRendererTitlebarRightInset();
  const [activeView, setActiveView] = useState<ShellActiveView>('overview');
  const [studioMode, setStudioMode] = useState<StudioMode>(
    StudioModeTab.Record,
  );
  const [studioRightPanelView, setStudioRightPanelView] =
    useState<StudioRightPanelView | null>(null);
  const [studioRightPanelClosing, setStudioRightPanelClosing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  // Bridges the gap between any device-click path (Sidebar row, Overview
  // card, Overview-form Submit) and antd Form.useWatch propagating the
  // chosen platform to MainContent. Without this hint the connecting
  // header would render the default Android phone icon for one frame
  // even when the user picked PC/Web.
  const [pendingCreatePlatform, setPendingCreatePlatform] = useState<
    StudioPlatformId | undefined
  >();
  const [windowFocused, setWindowFocused] = useState(
    typeof document === 'undefined' ? true : document.hasFocus(),
  );
  const [modelEnvText, setModelEnvText] = useState<string>(() =>
    loadModelEnvText(),
  );
  const [agentOptions, setAgentOptions] = useState(() => loadAgentOptions());
  const initialAgentOptionsRef = useRef(agentOptions);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    readPersistedWidth(
      SIDEBAR_WIDTH_STORAGE_KEY,
      SIDEBAR_DEFAULT_WIDTH,
      SIDEBAR_MIN_WIDTH,
      SIDEBAR_MAX_WIDTH,
    ),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const settingsAnchorRef = useRef<HTMLDivElement | null>(null);
  const studioRightPanelCloseTimerRef = useRef<number | null>(null);
  const previousStudioPanelContextRef = useRef({ activeView, studioMode });
  const updater = useStudioUpdater();
  const modelConfigComplete = useMemo(
    () => hasCompleteModelEnvConfig(modelEnvText),
    [modelEnvText],
  );
  useEffect(() => {
    const runtime = window.studioRuntime;
    if (!runtime) {
      return;
    }
    void runtime
      .updateAgentOptions(initialAgentOptionsRef.current)
      .catch((error) =>
        debugAgentOptions('Failed to restore Agent options:', error),
      );
  }, []);
  const clearStudioRightPanelCloseTimer = useCallback(() => {
    if (studioRightPanelCloseTimerRef.current !== null) {
      window.clearTimeout(studioRightPanelCloseTimerRef.current);
      studioRightPanelCloseTimerRef.current = null;
    }
  }, []);
  const openStudioRightPanel = useCallback(
    (view: StudioRightPanelView) => {
      clearStudioRightPanelCloseTimer();
      setStudioRightPanelClosing(false);
      setStudioRightPanelView(view);
    },
    [clearStudioRightPanelCloseTimer],
  );
  const closeStudioRightPanel = useCallback(() => {
    if (!studioRightPanelView) {
      return;
    }
    if (studioRightPanelClosing) {
      clearStudioRightPanelCloseTimer();
      setStudioRightPanelView(null);
      setStudioRightPanelClosing(false);
      return;
    }
    setStudioRightPanelClosing(true);
    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const finishClosing = () => {
      studioRightPanelCloseTimerRef.current = null;
      setStudioRightPanelView(null);
      setStudioRightPanelClosing(false);
    };
    if (
      reducedMotion ||
      studioRightPanelView.type !== StudioRightPanelViewType.Markdown
    ) {
      finishClosing();
      return;
    }
    studioRightPanelCloseTimerRef.current = window.setTimeout(
      finishClosing,
      STUDIO_RIGHT_PANEL_ANIMATION_MS,
    );
  }, [
    clearStudioRightPanelCloseTimer,
    studioRightPanelClosing,
    studioRightPanelView,
  ]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(sidebarWidth),
    );
  }, [sidebarWidth]);

  useEffect(
    () => clearStudioRightPanelCloseTimer,
    [clearStudioRightPanelCloseTimer],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleFocus = () => setWindowFocused(true);
    const handleBlur = () => setWindowFocused(false);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const studioPlayground = useStudioPlayground();
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openEnvModal = useCallback(() => {
    setSettingsOpen(false);
    setModelModalOpen(true);
  }, []);
  const closeModelModal = useCallback(() => setModelModalOpen(false), []);
  // Going back to Overview tears down the live session and clears every
  // selection-shaped form field so the sidebar / device cards stop
  // showing a "still selected" row that no longer corresponds to
  // anything running on the playground server.
  const selectOverview = useCallback(() => {
    setActiveView('overview');
    setPendingCreatePlatform(undefined);
    if (studioPlayground.phase !== 'ready') return;
    const { actions, state } = studioPlayground.controller;
    state.form.setFieldsValue({
      platformId: undefined,
      'web.url': undefined,
      'ios.host': undefined,
      'ios.port': undefined,
      'computer.displayId': undefined,
      'android.deviceId': undefined,
      'harmony.deviceId': undefined,
    });
    if (!state.sessionViewState.connected) return;
    void actions.destroySession();
  }, [studioPlayground]);

  const openExternalUrl = useCallback(
    (url: string) => {
      closeSettings();
      void requireElectronShell().openExternalUrl(url);
    },
    [closeSettings],
  );

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const anchor = settingsAnchorRef.current;
      if (
        anchor &&
        event.target instanceof Node &&
        anchor.contains(event.target)
      ) {
        return;
      }

      closeSettings();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [settingsOpen, closeSettings]);

  const startResize = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const handleMove = (e: MouseEvent) => {
        const delta = e.clientX - startX;
        const next = Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, startWidth + delta),
        );
        setSidebarWidth(next);
      };
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [sidebarWidth],
  );

  const shouldShowRightPanel = activeView !== 'overview';
  const shouldShowStudioRightPanel =
    shouldShowRightPanel && Boolean(studioRightPanelView);
  const studioRightPanelWidth =
    shouldShowStudioRightPanel && studioRightPanelView
      ? getStudioRightPanelWidth(studioRightPanelView)
      : 0;
  const studioRightPanelStyle: CSSProperties = {
    width: studioRightPanelWidth,
    '--studio-titlebar-right-inset': `${titlebarInsetRight}px`,
  } as CSSProperties;
  const shouldFloatStudioModePanel =
    shouldShowStudioRightPanel &&
    (studioMode === StudioModeTab.Record ||
      studioMode === StudioModeTab.Replay);
  const mainAreaStyle: CSSProperties = {
    left: (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth) + 4,
  };

  useEffect(() => {
    const previousContext = previousStudioPanelContextRef.current;
    const panelContextChanged =
      previousContext.activeView !== activeView ||
      previousContext.studioMode !== studioMode;
    previousStudioPanelContextRef.current = { activeView, studioMode };
    if (!panelContextChanged) {
      return;
    }
    closeStudioRightPanel();
  }, [activeView, closeStudioRightPanel, studioMode]);

  // When the OS window loses focus, replace the translucent vibrancy
  // background with a flat solid panel — matching macOS's own inactive
  // window treatment. Light mode wants a near-white panel (#F4F5F6),
  // dark mode wants a flat dark gray (#292929).
  const sidebarBgClassName = windowFocused
    ? ''
    : 'bg-[#F4F5F6] dark:bg-[#292929]';
  const sidebarPanelStyle: CSSProperties = {
    transform: sidebarCollapsed
      ? `translateX(-${sidebarWidth}px)`
      : 'translateX(0)',
    width: sidebarWidth,
  };
  return (
    <div
      className={`relative h-full w-full overflow-hidden font-sans ${
        windowFocused ? '' : 'bg-app-bg'
      }`}
    >
      <div className="app-drag absolute left-0 right-0 top-0 z-10 h-[48px]" />

      <div
        className={`absolute left-0 top-0 z-30 h-full overflow-visible transition-transform ${SIDEBAR_TRANSITION_CLASS} ${sidebarBgClassName}`}
        style={sidebarPanelStyle}
      >
        <div className="absolute left-[4px] right-[4px] top-[52px] overflow-hidden">
          <Sidebar
            activeView={activeView}
            onPendingCreatePlatform={setPendingCreatePlatform}
            onSelectDevice={() => setActiveView('device')}
            onSelectOverview={selectOverview}
          />
        </div>

        <div
          className="absolute bottom-[6px] left-[4px] right-[4px]"
          ref={settingsAnchorRef}
        >
          {settingsOpen && (
            <div className="absolute bottom-[78px] left-0 z-50">
              <SettingsPanel
                onGithubClick={() =>
                  openExternalUrl(STUDIO_EXTERNAL_LINKS.github)
                }
                onThemeChange={closeSettings}
                onWebsiteClick={() =>
                  openExternalUrl(STUDIO_EXTERNAL_LINKS.website)
                }
                updater={{
                  appVersion: updater.appVersion,
                  onDownload: () => {
                    void updater.download();
                  },
                  onInstall: () => {
                    void updater.install();
                  },
                  onOpenDownloadPage: () =>
                    openExternalUrl(STUDIO_EXTERNAL_LINKS.studioReleases),
                  onOpenRunDirectory: () => {
                    void window.electronShell?.openRunDirectory();
                  },
                  status: updater.status,
                }}
              />
            </div>
          )}
          <SidebarFooter
            envAlert={!modelConfigComplete}
            onEnvClick={openEnvModal}
            onToggleSettings={() => setSettingsOpen((prev) => !prev)}
            settingsOpen={settingsOpen}
          />
        </div>

        {!sidebarCollapsed && (
          <div
            aria-hidden
            className="app-no-drag absolute right-0 top-0 z-30 h-full w-[4px] cursor-col-resize hover:bg-border-subtle"
            onMouseDown={startResize}
            style={{ touchAction: 'none' }}
          />
        )}
      </div>

      <div
        className={`absolute bottom-[4px] right-[4px] top-[4px] z-20 flex gap-[4px] rounded-[12px] bg-transparent transition-[left] ${SIDEBAR_TRANSITION_CLASS}`}
        style={mainAreaStyle}
      >
        <MainContent
          activeView={activeView}
          modelConfigComplete={modelConfigComplete}
          modelEnvText={modelEnvText}
          floatingStudioModePanel={shouldFloatStudioModePanel}
          onOpenEnvModal={openEnvModal}
          onCloseStudioRightPanel={closeStudioRightPanel}
          onOpenStudioRightPanel={openStudioRightPanel}
          onPendingCreatePlatformChange={setPendingCreatePlatform}
          onStudioModeChange={setStudioMode}
          onSelectDeviceView={() => setActiveView('device')}
          onSelectOverview={selectOverview}
          pendingCreatePlatform={pendingCreatePlatform}
          studioMode={studioMode}
          titlebarInsetLeft={
            sidebarCollapsed ? COLLAPSED_TITLEBAR_INSET : undefined
          }
          titlebarInsetRight={titlebarInsetRight || undefined}
        />
        {shouldShowStudioRightPanel && studioRightPanelView ? (
          <div
            className={`box-border flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-[12px] border border-border-subtle bg-surface dark:border-[#323131] dark:bg-[#181818]${
              studioRightPanelView.type === StudioRightPanelViewType.Markdown
                ? ` studio-right-panel-markdown-drawer studio-right-panel-markdown-drawer-${
                    studioRightPanelClosing ? 'exit' : 'enter'
                  }`
                : ''
            }`}
            style={studioRightPanelStyle}
          >
            <StudioRightPanel
              onClose={closeStudioRightPanel}
              view={studioRightPanelView}
            />
          </div>
        ) : null}
      </div>

      <div
        className={`app-no-drag absolute z-[80] flex h-[22px] items-center gap-[8px] transition-[opacity,transform] ${SIDEBAR_TRANSITION_CLASS}`}
        style={{ left: SIDEBAR_TOGGLE_LEFT, top: SIDEBAR_TOGGLE_TOP }}
      >
        <button
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={sidebarCollapsed}
          className="app-no-drag flex h-[22px] w-[22px] cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-text-secondary transition-transform duration-150 ease-out active:scale-90"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setSidebarCollapsed((prev) => !prev);
          }}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          type="button"
        >
          <SidebarCollapseIcon collapsed={sidebarCollapsed} />
        </button>
        <UpdatePill
          onDownload={() => {
            void updater.download();
          }}
          onInstall={() => {
            void updater.install();
          }}
          onOpenDownloadPage={() =>
            openExternalUrl(STUDIO_EXTERNAL_LINKS.studioReleases)
          }
          status={updater.status}
        />
      </div>

      <ModelEnvConfigModal
        onClose={closeModelModal}
        agentOptionsValue={agentOptions}
        onSave={async ({ text, agentOptions: nextAgentOptions }) => {
          const runtime = window.studioRuntime;
          if (!runtime) {
            throw new Error('Studio runtime is not available.');
          }
          await runtime.updateAgentOptions(nextAgentOptions);
          saveModelEnvText(text);
          setModelEnvText(text);
          saveAgentOptions(nextAgentOptions);
          setAgentOptions(nextAgentOptions);
          closeModelModal();
        }}
        open={modelModalOpen}
        textValue={modelEnvText}
      />
    </div>
  );
}
