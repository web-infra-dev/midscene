import { useCallback, useEffect, useRef, useState } from 'react';
import { STUDIO_EXTERNAL_LINKS } from '../../../shared/external-links';
import { assetUrls } from '../../assets';
import MainContent from '../MainContent';
import Playground from '../Playground';
import SettingsPanel from '../SettingsPanel';
import Sidebar, { SidebarFooter } from '../Sidebar';
import { ModelEnvConfigModal } from './ModelEnvConfigModal';
import {
  isModelEnvConfigured,
  loadModelEnvText,
  saveModelEnvText,
} from './model-env-storage';
import type { ShellActiveView } from './types';

export type { ShellActiveView };

const requireElectronShell = () => {
  if (!window.electronShell) {
    throw new Error('Electron shell bridge is unavailable.');
  }

  return window.electronShell;
};

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
      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[#474848] hover:bg-black/5"
      onClick={onToggle}
      type="button"
    >
      <img
        alt=""
        className={`h-[14px] w-4 object-contain ${
          collapsed ? 'scale-x-[-1]' : ''
        }`}
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
  const [modelEnvText, setModelEnvText] = useState<string>(() =>
    loadModelEnvText(),
  );
  const settingsAnchorRef = useRef<HTMLDivElement | null>(null);
  const modelEnvConfigured = isModelEnvConfigured(modelEnvText);
  const isMacLike =
    typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
  const collapsedToggleOffsetClass = isMacLike ? 'left-[86px]' : 'left-[12px]';
  const collapsedHeaderOffsetClass = isMacLike ? 'pl-[104px]' : 'pl-[36px]';

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
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

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F6F6F6] font-sans">
      {!collapsed && (
        <div className="absolute left-0 top-0 h-full w-[240px]">
          <div className="absolute right-[12px] top-[18px]">
            <SidebarToggleButton
              collapsed={false}
              onToggle={() => setCollapsed(true)}
            />
          </div>

          <div className="absolute left-[4px] top-[52px] w-[232px] overflow-hidden">
            <Sidebar
              activeView={activeView}
              onSelectDevice={() => setActiveView('device')}
              onSelectOverview={() => setActiveView('overview')}
            />
          </div>

          <div
            className="absolute bottom-[6px] left-[4px] w-[232px]"
            ref={settingsAnchorRef}
          >
            {settingsOpen && (
              <div className="absolute bottom-[46px] left-0 z-50">
                <SettingsPanel
                  onEnvConfigClick={openEnvModal}
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
        </div>
      )}

      {collapsed && (
        <div
          className={`absolute top-[18px] z-40 ${collapsedToggleOffsetClass}`}
        >
          <SidebarToggleButton collapsed onToggle={() => setCollapsed(false)} />
        </div>
      )}

      <div
        className={`absolute bottom-[4px] right-[4px] top-[4px] flex rounded-[12px] bg-white ${
          collapsed ? 'left-[4px]' : 'left-[240px]'
        }`}
      >
        <MainContent
          activeView={activeView}
          envConfigured={modelEnvConfigured}
          headerOffsetClass={collapsed ? collapsedHeaderOffsetClass : undefined}
          onOpenModelConfig={openEnvModal}
          onOpenSettings={openSettings}
          onSelectDeviceView={() => setActiveView('device')}
        />
        <Playground />
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
