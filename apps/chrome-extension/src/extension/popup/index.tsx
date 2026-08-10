/// <reference types="chrome" />
import {
  ApiOutlined,
  MenuOutlined,
  SendOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { runConnectivityTest } from '@midscene/core/ai-model';
import type { PlaygroundSDK } from '@midscene/playground';
import { ModelConfigManager, type TModelConfig } from '@midscene/shared/env';
import {
  type CommonAgentOptions,
  NavActions,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import { App as AntdApp, ConfigProvider, Dropdown, theme } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserExtensionPlayground } from '../../components/playground';
import Bridge from '../bridge';
import Recorder from '../recorder';
import './index.less';
import { MIDSCENE_MODEL_API_KEY } from '@midscene/shared/env';
import { safeOverrideAIConfig } from '@midscene/visualizer';
import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';
// remember to destroy the agent when the tab is destroyed: agent.page.destroy()
const extensionAgentForTab = (
  forceSameTabNavigation = true,
  agentOptions: CommonAgentOptions = {},
) => {
  const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
  return new ChromeExtensionProxyPageAgent(page, agentOptions);
};

const STORAGE_KEY = 'midscene-popup-mode';
const AGENT_OPTIONS_STORAGE_KEY = 'midscene-extension-agent-options';
const EXTENSION_PRIMARY_COLORS = {
  dark: '#2D5290',
  light: '#2B83FF',
} as const;

type ExtensionThemeMode = keyof typeof EXTENSION_PRIMARY_COLORS;

function getPreferredThemeMode(): ExtensionThemeMode {
  if (typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

async function runChromeConnectivityTest(config: Record<string, string>) {
  const modelConfigManager = new ModelConfigManager(config as TModelConfig);
  return runConnectivityTest({
    defaultModelConfig: modelConfigManager.getModelConfig('default'),
    insightModelConfig: modelConfigManager.getModelConfig('insight'),
    planningModelConfig: modelConfigManager.getModelConfig('planning'),
  });
}

function normalizeAgentOptions(value: unknown): CommonAgentOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const options: CommonAgentOptions = {};
  if (
    typeof source.replanningCycleLimit === 'number' &&
    Number.isInteger(source.replanningCycleLimit) &&
    source.replanningCycleLimit >= 0
  ) {
    options.replanningCycleLimit = source.replanningCycleLimit;
  }
  if (
    typeof source.waitAfterAction === 'number' &&
    Number.isFinite(source.waitAfterAction) &&
    source.waitAfterAction >= 0
  ) {
    options.waitAfterAction = source.waitAfterAction;
  }
  if (
    typeof source.screenshotShrinkFactor === 'number' &&
    Number.isFinite(source.screenshotShrinkFactor) &&
    source.screenshotShrinkFactor >= 1
  ) {
    options.screenshotShrinkFactor = source.screenshotShrinkFactor;
  }
  return options;
}

function loadAgentOptions(): CommonAgentOptions {
  try {
    return normalizeAgentOptions(
      JSON.parse(localStorage.getItem(AGENT_OPTIONS_STORAGE_KEY) || '{}'),
    );
  } catch {
    return {};
  }
}

export function PlaygroundPopup() {
  const setPopupTab = useEnvConfig((state) => state.setPopupTab);
  const [playgroundSDK, setPlaygroundSDK] = useState<PlaygroundSDK | null>(
    null,
  );
  const [agentOptions, setAgentOptions] =
    useState<CommonAgentOptions>(loadAgentOptions);
  const [themeMode, setThemeMode] = useState<ExtensionThemeMode>(
    getPreferredThemeMode,
  );
  const [currentMode, setCurrentMode] = useState<
    'playground' | 'bridge' | 'recorder'
  >(() => {
    const savedMode = localStorage.getItem(STORAGE_KEY);
    return (savedMode as 'playground' | 'bridge' | 'recorder') || 'playground';
  });

  // The extension has no user-selectable theme yet, so follow the system
  // preference for both Ant Design portals and shared visualizer styles.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      document.documentElement.dataset.theme = 'light';
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => {
      const nextThemeMode = mediaQuery.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = nextThemeMode;
      setThemeMode(nextThemeMode);
    };

    syncTheme();
    mediaQuery.addEventListener('change', syncTheme);
    return () => mediaQuery.removeEventListener('change', syncTheme);
  }, []);

  const antdThemeConfig = useMemo(() => {
    const baseTheme = globalThemeConfig();
    return {
      ...baseTheme,
      algorithm:
        themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
      token: {
        ...baseTheme.token,
        colorPrimary: EXTENSION_PRIMARY_COLORS[themeMode],
      },
    };
  }, [themeMode]);

  const config = useEnvConfig((state) => state.config);

  const getAgent = useCallback(
    (forceSameTabNavigation?: boolean) =>
      extensionAgentForTab(forceSameTabNavigation, agentOptions),
    [agentOptions],
  );

  const handleAgentOptionsSave = useCallback((options: CommonAgentOptions) => {
    localStorage.setItem(AGENT_OPTIONS_STORAGE_KEY, JSON.stringify(options));
    setAgentOptions(options);
  }, []);

  // Sync popupTab with saved mode on mount
  useEffect(() => {
    setPopupTab(currentMode);
  }, []);

  // Override AI configuration
  useEffect(() => {
    console.log('Chrome Extension - Overriding AI config:', config);
    console.log('MIDSCENE_MODEL_API_KEY exists:', !!MIDSCENE_MODEL_API_KEY);

    if (config && Object.keys(config).length >= 1) {
      safeOverrideAIConfig(config);
    }
  }, [config]);

  const menuItems = [
    {
      key: 'playground',
      icon: <SendOutlined />,
      label: 'Playground',
      onClick: () => {
        setCurrentMode('playground');
        setPopupTab('playground');
        localStorage.setItem(STORAGE_KEY, 'playground');
      },
    },
    {
      key: 'recorder',
      label: 'Recorder (Preview)',
      icon: <VideoCameraOutlined />,
      onClick: () => {
        setCurrentMode('recorder');
        setPopupTab('recorder');
        localStorage.setItem(STORAGE_KEY, 'recorder');
      },
    },
    {
      key: 'bridge',
      icon: <ApiOutlined />,
      label: 'Bridge Mode',
      onClick: () => {
        setCurrentMode('bridge');
        setPopupTab('bridge');
        localStorage.setItem(STORAGE_KEY, 'bridge');
      },
    },
  ];

  const renderContent = () => {
    if (currentMode === 'bridge') {
      return (
        <div className="popup-content bridge-mode">
          <div className="bridge-container">
            <Bridge />
          </div>
        </div>
      );
    }
    if (currentMode === 'recorder') {
      return (
        <div className="popup-content recorder-mode">
          <Recorder />
        </div>
      );
    }

    // Check if configuration is ready
    const configReady = config && Object.keys(config).length >= 1;
    console.log('Playground mode - config:', {
      config,
      configReady,
    });

    return (
      <div className="popup-content">
        {/* Playground Component */}
        <div className="playground-component">
          <BrowserExtensionPlayground
            agentOptions={agentOptions}
            getAgent={getAgent}
            onAgentOptionsSave={handleAgentOptionsSave}
            showContextPreview={false}
            onPlaygroundSDKChange={setPlaygroundSDK}
            onVerify={runChromeConnectivityTest}
          />
        </div>
      </div>
    );
  };

  return (
    <ConfigProvider theme={antdThemeConfig}>
      <AntdApp component={false}>
        <div className="popup-wrapper">
          {/* top navigation bar */}
          <div className="popup-nav">
            <div className="nav-left">
              <Dropdown
                menu={{ items: menuItems }}
                trigger={['click']}
                placement="bottomLeft"
                overlayClassName="mode-selector-dropdown"
              >
                <MenuOutlined className="nav-icon menu-trigger" />
              </Dropdown>
              <span className="nav-title">
                {currentMode === 'playground'
                  ? 'Playground'
                  : currentMode === 'recorder'
                    ? 'Recorder'
                    : 'Bridge Mode'}
              </span>
            </div>
            <div className="nav-right">
              <NavActions
                showTooltipWhenEmpty={false}
                showModelName={false}
                playgroundSDK={playgroundSDK}
                onVerify={runChromeConnectivityTest}
                agentOptions={agentOptions}
                configModalClassName="chrome-extension-model-env-config-modal"
                configModalWidth={360}
                envTextareaAutoSize={false}
                envTextareaMinRows={4}
                onAgentOptionsSave={handleAgentOptionsSave}
              />
            </div>
          </div>

          {/* main content area */}
          {renderContent()}
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}
