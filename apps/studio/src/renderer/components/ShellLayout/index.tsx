import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { STUDIO_EXTERNAL_LINKS } from '../../../shared/external-links';
import { assetUrls } from '../../assets';
import MainContent from '../MainContent';
import { MaskedIcon } from '../MaskedIcon';
import Playground from '../Playground';
import SettingsPanel from '../SettingsPanel';
import Sidebar, { SidebarFooter } from '../Sidebar';
import { ModelEnvConfigModal } from './ModelEnvConfigModal';
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

function SidebarToggleButton({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-text-secondary hover:bg-surface-hover"
      onClick={onToggle}
      type="button"
    >
      <MaskedIcon
        className={`h-[14px] w-4 ${collapsed ? 'scale-x-[-1]' : ''}`}
        src={assetUrls.sidebar.leftSidebar}
      />
    </button>
  );
}

export default function ShellLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<ShellActiveView>('device');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
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
  const isMacLike =
    typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
  const collapsedToggleButtonLeft = isMacLike ? 86 : 12;
  const collapsedHeaderOffsetClass = isMacLike ? 'pl-[104px]' : 'pl-[36px]';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(sidebarWidth),
    );
  }, [sidebarWidth]);

  // Sidebar pane piggy-backs on the OS vibrancy/acrylic material; when the
  // window loses focus the OS dims the material and the sidebar reads as
  // see-through. Stamp an opaque background while unfocused so it keeps a
  // solid surface like the rest of the app shell.
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

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openEnvModal = useCallback(() => {
    setSettingsOpen(false);
    setModelModalOpen(true);
  }, []);
  const closeModelModal = useCallback(() => setModelModalOpen(false), []);

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

  // Button is 24x24. Its vertical center (top + 12) must match the traffic
  // lights' vertical center (y + 6) so the two icons sit on the same row.
  // Traffic lights at y=14 → center 20 → button top = 20 − 12 = 8.
  const toggleButtonTop = 8;
  const toggleButtonLeft = collapsed
    ? collapsedToggleButtonLeft
    : sidebarWidth - 38;

  const mainAreaStyle: CSSProperties = {
    ...(collapsed ? {} : { left: sidebarWidth }),
    ['--studio-playground-width' as string]: `${playgroundWidth}px`,
  };

  return (
    <div className="relative h-full w-full overflow-hidden font-sans">
      <div className="app-drag absolute left-0 right-0 top-0 z-10 h-[52px]" />

      {!collapsed && (
        <div
          className={`absolute left-0 top-0 h-full ${
            windowFocused ? '' : 'bg-surface'
          }`}
          style={{ width: sidebarWidth }}
        >
          <div className="absolute left-[4px] right-[4px] top-[52px] overflow-hidden">
            <Sidebar
              activeView={activeView}
              onSelectDevice={() => setActiveView('device')}
              onSelectOverview={() => setActiveView('overview')}
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
                  onWebsiteClick={() =>
                    openExternalUrl(STUDIO_EXTERNAL_LINKS.website)
                  }
                />
              </div>
            )}
            <SidebarFooter
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
      )}

      <div
        className={`absolute bottom-[4px] right-[4px] top-[4px] z-20 flex rounded-[12px] bg-surface ${
          collapsed ? 'left-[4px]' : ''
        }`}
        style={mainAreaStyle}
      >
        <MainContent
          activeView={activeView}
          headerOffsetClass={collapsed ? collapsedHeaderOffsetClass : undefined}
          onSelectDeviceView={() => setActiveView('device')}
          onSelectOverview={() => setActiveView('overview')}
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

      <div
        className="app-no-drag absolute z-50"
        style={{ top: toggleButtonTop, left: toggleButtonLeft }}
      >
        <SidebarToggleButton
          collapsed={collapsed}
          onToggle={() => setCollapsed((prev) => !prev)}
        />
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
