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
import { useStudioPlayground } from '../../playground/useStudioPlayground';
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

export default function ShellLayout() {
  const [activeView, setActiveView] = useState<ShellActiveView>('overview');
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
  const settingsAnchorRef = useRef<HTMLDivElement | null>(null);
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
    left: sidebarWidth,
    ['--studio-playground-width' as string]: `${playgroundWidth}px`,
  };

  // When the OS window loses focus, replace the translucent vibrancy
  // background with a flat solid panel — matching macOS's own inactive
  // window treatment. Light mode wants a near-white panel (#F4F5F6),
  // dark mode wants a flat dark gray (#292929).
  const sidebarBgClassName = windowFocused
    ? ''
    : 'bg-[#F4F5F6] dark:bg-[#292929]';

  return (
    <div
      className={`relative h-full w-full overflow-hidden font-sans ${
        windowFocused ? '' : 'bg-app-bg'
      }`}
    >
      <div className="app-drag absolute left-0 right-0 top-0 z-10 h-[52px]" />

      <div
        className={`absolute left-0 top-0 h-full ${sidebarBgClassName}`}
        style={{ width: sidebarWidth }}
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

        <div
          aria-hidden
          className="app-no-drag absolute right-0 top-0 z-30 h-full w-[4px] cursor-col-resize hover:bg-border-subtle"
          onMouseDown={(event) => startResize('sidebar', event)}
          style={{ touchAction: 'none' }}
        />
      </div>

      <div
        className="absolute bottom-[4px] right-[4px] top-[4px] z-20 flex rounded-[12px] bg-surface"
        style={mainAreaStyle}
      >
        <MainContent
          activeView={activeView}
          modelConfigComplete={modelConfigComplete}
          modelEnvText={modelEnvText}
          onOpenEnvModal={openEnvModal}
          onPendingCreatePlatformChange={setPendingCreatePlatform}
          onSelectDeviceView={() => setActiveView('device')}
          onSelectOverview={selectOverview}
          pendingCreatePlatform={pendingCreatePlatform}
        />
        {activeView !== 'overview' && (
          <>
            <div
              aria-hidden
              className="app-no-drag absolute top-0 z-30 h-full w-[4px] cursor-col-resize hover:bg-border-subtle"
              onMouseDown={(event) => startResize('playground', event)}
              style={{ right: playgroundWidth - 2, touchAction: 'none' }}
            />
            <Playground />
          </>
        )}
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
