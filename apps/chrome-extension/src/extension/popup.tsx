/// <reference types="chrome" />
import {
  ApiOutlined,
  GithubOutlined,
  MenuOutlined,
  QuestionCircleOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  EnvConfig,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import '@midscene/visualizer/index.css';
import { ConfigProvider, Dropdown, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { BrowserExtensionPlayground } from '../components/playground';
import Bridge from './bridge';
import Recorder from './recorder';
import './popup.less';
import { OPENAI_API_KEY, overrideAIConfig } from '@midscene/shared/env';
import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';
import BridgeIcon from '../icons/bridge.svg?react';
import PlaygroundIcon2 from '../icons/playground-2.svg?react';
// remember to destroy the agent when the tab is destroyed: agent.page.destroy()
const extensionAgentForTab = (forceSameTabNavigation = true) => {
  const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
  return new ChromeExtensionProxyPageAgent(page);
};

export function PlaygroundPopup() {
  const { setPopupTab } = useEnvConfig();
  const [currentMode, setCurrentMode] = useState<
    'playground' | 'bridge' | 'recorder'
  >('recorder');

  const { config, deepThink } = useEnvConfig();

  // Override AI configuration
  useEffect(() => {
    console.log('Chrome Extension - Overriding AI config:', config);
    console.log('OPENAI_API_KEY exists:', !!OPENAI_API_KEY);
    overrideAIConfig(config);
  }, [config]);

  const menuItems = [
    {
      key: 'playground',
      icon: <PlaygroundIcon2 />,
      label: 'Playground',
      onClick: () => {
        setCurrentMode('playground');
        setPopupTab('playground');
      },
    },
    {
      key: 'recorder',
      label: 'Recorder (Preview)',
      icon: <VideoCameraOutlined />,
      onClick: () => {
        setCurrentMode('recorder');
        setPopupTab('recorder');
      },
    },
    {
      key: 'bridge',
      icon: <BridgeIcon />,
      label: 'Bridge Mode',
      onClick: () => {
        setCurrentMode('bridge');
        setPopupTab('bridge');
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

    return (
      <div className="popup-content">
        {/* Playground Component */}
        <div className="playground-component">
          <BrowserExtensionPlayground
            getAgent={(forceSameTabNavigation?: boolean) => {
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
            <Typography.Link
              href="https://github.com/web-infra-dev/midscene"
              target="_blank"
            >
              <GithubOutlined className="nav-icon" />
            </Typography.Link>
            <Typography.Link
              href="https://midscenejs.com/quick-experience.html"
              target="_blank"
            >
              <QuestionCircleOutlined className="nav-icon" />
            </Typography.Link>
            <EnvConfig showTooltipWhenEmpty={false} showModelName={false} />
          </div>
        </div>

        {/* main content area */}
        {renderContent()}
      </div>
    </ConfigProvider>
  );
}
