/// <reference types="chrome" />
import {
  ApiOutlined,
  MenuOutlined,
  SendOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  NavActions,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import { ConfigProvider, Dropdown, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { BrowserExtensionPlayground } from '../../components/playground';
import Bridge from '../bridge';
import Recorder from '../recorder';
import './index.less';
import { OPENAI_API_KEY } from '@midscene/shared/env';
import { safeOverrideAIConfig } from '@midscene/visualizer';
import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';
// remember to destroy the agent when the tab is destroyed: agent.page.destroy()
const extensionAgentForTab = (forceSameTabNavigation = true) => {
  const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
  return new ChromeExtensionProxyPageAgent(page);
};

const STORAGE_KEY = 'midscene-popup-mode';

export function PlaygroundPopup() {
  const { setPopupTab } = useEnvConfig();
  const [currentMode, setCurrentMode] = useState<
    'playground' | 'bridge' | 'recorder'
  >(() => {
    const savedMode = localStorage.getItem(STORAGE_KEY);
    return (savedMode as 'playground' | 'bridge' | 'recorder') || 'playground';
  });

  const { config } = useEnvConfig();

  // Sync popupTab with saved mode on mount
  useEffect(() => {
    setPopupTab(currentMode);
  }, []);

  // Override AI configuration
  useEffect(() => {
    console.log('Chrome Extension - Overriding AI config:', config);
    console.log('OPENAI_API_KEY exists:', !!OPENAI_API_KEY);

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
            getAgent={(forceSameTabNavigation?: boolean) => {
              console.log(
                'getAgent called with forceSameTabNavigation:',
                forceSameTabNavigation,
              );
              return extensionAgentForTab(forceSameTabNavigation);
            }}
            showContextPreview={false}
          />
        </div>
      </div>
    );
  };

  return (
    <ConfigProvider theme={globalThemeConfig()}>
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
            <NavActions showTooltipWhenEmpty={false} showModelName={false} />
          </div>
        </div>

        {/* main content area */}
        {renderContent()}
      </div>
    </ConfigProvider>
  );
}
