/// <reference types="chrome" />
import {
  ApiOutlined,
  GithubOutlined,
  MenuOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import {
  EnvConfig,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import '@midscene/visualizer/index.css';
import { ConfigProvider, Dropdown, Typography } from 'antd';
import { useState } from 'react';
import { BrowserExtensionPlayground } from '../component/playground';
import { getExtensionVersion } from '../utils';
import Bridge from './bridge';
import Recorder from './recorder';
import './popup.less';
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

declare const __SDK_VERSION__: string;

export function PlaygroundPopup() {
  const extensionVersion = getExtensionVersion();
  const { setPopupTab } = useEnvConfig();
  const [currentMode, setCurrentMode] = useState<'playground' | 'bridge'>(
    'playground',
  );

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
          <div className="mode-header">
            <div className="mode-icon">
              <ApiOutlined />
            </div>
            <h2 className="mode-title">Bridge Mode</h2>
          </div>
          <div className="bridge-container">
            <Bridge />
          </div>
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
              {currentMode === 'playground' ? 'Playground' : 'Bridge Mode'}
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
