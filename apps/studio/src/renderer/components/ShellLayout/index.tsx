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
import type { UpdateStatus } from '../../../shared/updater-contract';
import { assetUrls } from '../../assets';
import { useStudioUpdater } from '../../hooks/useStudioUpdater';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import type { StudioRecorderPanelMode } from '../../recorder/types';
import MainContent from '../MainContent';
import Playground from '../Playground';
import SettingsPanel from '../SettingsPanel';
import Sidebar, { SidebarFooter } from '../Sidebar';
import { ModelEnvConfigModal } from './ModelEnvConfigModal';
import { hasCompleteModelEnvConfig } from './connectivity-env';
import { loadModelEnvText, saveModelEnvText } from './model-env-storage';
import type { ShellActiveView } from './types';

export type { ShellActiveView };

const SIDEBAR_WIDTH_STORAGE_KEY = 'studio.sidebarWidth';
const PLAYGROUND_WIDTH_STORAGE_KEY = 'studio.playgroundWidth';

const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 400;

const PLAYGROUND_DEFAULT_WIDTH = 400;
const PLAYGROUND_MIN_WIDTH = 320;
const PLAYGROUND_MAX_WIDTH = 720;
const RECORDER_PANEL_CONTENT_WIDTH = 320;
const RECORDER_PANEL_RIGHT_OFFSET = 12;
const RECORDER_OVERLAY_WIDTH =
  RECORDER_PANEL_CONTENT_WIDTH + RECORDER_PANEL_RIGHT_OFFSET;
const SIDEBAR_COLLAPSED_WIDTH = 0;
const COLLAPSED_TITLEBAR_INSET = 280;
const TITLEBAR_CONTROL_TOP = 11;
const UPDATE_PILL_LEFT = 128;
const SIDEBAR_TOGGLE_LEFT = 98;
const SIDEBAR_TRANSITION_CLASS = 'duration-200 ease-[cubic-bezier(0.2,0,0,1)]';

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
      className="app-no-drag box-border inline-flex items-center gap-[4px] rounded-[40px] border-0 bg-[#DEEBEC] p-[5px] font-sans text-[11px] font-medium leading-[12px] text-[#1A79FF]"
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
  const [activeView, setActiveView] = useState<ShellActiveView>('overview');
  const [rightPanelMode, setRightPanelMode] =
    useState<StudioRecorderPanelMode>('playground');
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
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    readPersistedWidth(
      SIDEBAR_WIDTH_STORAGE_KEY,
      SIDEBAR_DEFAULT_WIDTH,
      SIDEBAR_MIN_WIDTH,
      SIDEBAR_MAX_WIDTH,
    ),
  );
  const [playgroundWidth, setPlaygroundWidth] = useState<number>(() =>
    readPersistedWidth(
      PLAYGROUND_WIDTH_STORAGE_KEY,
      PLAYGROUND_DEFAULT_WIDTH,
      PLAYGROUND_MIN_WIDTH,
      PLAYGROUND_MAX_WIDTH,
    ),
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const settingsAnchorRef = useRef<HTMLDivElement | null>(null);
  const updater = useStudioUpdater();
  const modelConfigComplete = useMemo(
    () => hasCompleteModelEnvConfig(modelEnvText),
    [modelEnvText],
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(sidebarWidth),
    );
  }, [sidebarWidth]);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      PLAYGROUND_WIDTH_STORAGE_KEY,
      String(playgroundWidth),
    );
  }, [playgroundWidth]);

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
    (kind: 'sidebar' | 'playground', event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = kind === 'sidebar' ? sidebarWidth : playgroundWidth;
      const min = kind === 'sidebar' ? SIDEBAR_MIN_WIDTH : PLAYGROUND_MIN_WIDTH;
      const max = kind === 'sidebar' ? SIDEBAR_MAX_WIDTH : PLAYGROUND_MAX_WIDTH;

      const handleMove = (e: MouseEvent) => {
        const delta =
          kind === 'sidebar' ? e.clientX - startX : startX - e.clientX;
        const next = Math.min(max, Math.max(min, startWidth + delta));
        if (kind === 'sidebar') {
          setSidebarWidth(next);
        } else {
          setPlaygroundWidth(next);
        }
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
    [sidebarWidth, playgroundWidth],
  );

  const mainAreaStyle: CSSProperties = {
    left: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth,
    ['--studio-playground-width' as string]: `${playgroundWidth}px`,
  };
  const shouldShowRightPanel = activeView !== 'overview';
  const recorderPanelActive =
    shouldShowRightPanel && rightPanelMode === 'recorder';

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
            onMouseDown={(event) => startResize('sidebar', event)}
            style={{ touchAction: 'none' }}
          />
        )}
      </div>

      <div
        className={`absolute bottom-[4px] right-[4px] top-[4px] z-20 flex rounded-[12px] bg-surface transition-[left] ${SIDEBAR_TRANSITION_CLASS}`}
        style={mainAreaStyle}
      >
        <MainContent
          activeView={activeView}
          modelConfigComplete={modelConfigComplete}
          modelEnvText={modelEnvText}
          onOpenEnvModal={openEnvModal}
          onPendingCreatePlatformChange={setPendingCreatePlatform}
          onRightPanelModeChange={setRightPanelMode}
          onSelectDeviceView={() => setActiveView('device')}
          onSelectOverview={selectOverview}
          pendingCreatePlatform={pendingCreatePlatform}
          rightPanelMode={rightPanelMode}
          titlebarInsetLeft={
            sidebarCollapsed ? COLLAPSED_TITLEBAR_INSET : undefined
          }
        />
        {shouldShowRightPanel && (
          <>
            {recorderPanelActive ? null : (
              <div
                aria-hidden
                className="app-no-drag absolute top-0 z-30 h-full w-[4px] cursor-col-resize hover:bg-border-subtle"
                onMouseDown={(event) => startResize('playground', event)}
                style={{ right: playgroundWidth - 2, touchAction: 'none' }}
              />
            )}
            <div
              className={
                recorderPanelActive
                  ? 'pointer-events-none absolute bottom-0 right-0 top-[52px] z-20 overflow-visible bg-transparent'
                  : 'relative z-0 flex h-full min-h-0'
              }
              style={
                recorderPanelActive
                  ? { width: RECORDER_OVERLAY_WIDTH }
                  : undefined
              }
            >
              <Playground
                onRightPanelModeChange={setRightPanelMode}
                rightPanelMode={rightPanelMode}
              />
            </div>
          </>
        )}
      </div>

      <div
        className="app-no-drag absolute z-[80]"
        style={{
          left: UPDATE_PILL_LEFT,
          top: TITLEBAR_CONTROL_TOP,
        }}
      >
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

      <div
        className={`app-no-drag absolute z-[80] flex items-center gap-[8px] transition-[opacity,transform] ${SIDEBAR_TRANSITION_CLASS}`}
        style={{ left: SIDEBAR_TOGGLE_LEFT, top: TITLEBAR_CONTROL_TOP }}
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
      </div>

      <ModelEnvConfigModal
        onClose={closeModelModal}
        onSave={({ text }) => {
          saveModelEnvText(text);
          setModelEnvText(text);
          closeModelModal();
        }}
        open={modelModalOpen}
        textValue={modelEnvText}
      />
    </div>
  );
}
