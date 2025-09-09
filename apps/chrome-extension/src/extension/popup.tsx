/// <reference types="chrome" />
import {
  ApiOutlined,
  GithubOutlined,
  MenuOutlined,
  QuestionCircleOutlined,
  SendOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  EnvConfig,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer';
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
// remember to destroy the agent when the tab is destroyed: agent.page.destroy()
const extensionAgentForTab = (forceSameTabNavigation = true) => {
  const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
  return new ChromeExtensionProxyPageAgent(page);
};

export function PlaygroundPopup() {
  const { setPopupTab } = useEnvConfig();
  const [currentMode, setCurrentMode] = useState<
    'playground' | 'bridge' | 'recorder'
  >('playground');

  const { config, deepThink } = useEnvConfig();

  // Track when AI config has been properly applied
  const [aiConfigReady, setAiConfigReady] = useState(false);

  // Override AI configuration and mark as ready
  useEffect(() => {
    console.log('Chrome Extension - Overriding AI config:', config);
    console.log('OPENAI_API_KEY exists:', !!OPENAI_API_KEY);

    if (config && Object.keys(config).length >= 1) {
      overrideAIConfig(config);
      // Add a small delay to ensure the config takes effect
      setTimeout(() => {
        console.log('AI config marked as ready');
        setAiConfigReady(true);
      }, 100);
    } else {
      setAiConfigReady(false);
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
      icon: <ApiOutlined />,
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

    // Check if configuration is ready
    const configReady = config && Object.keys(config).length >= 1;
    console.log('Playground mode - config:', {
      config,
      configReady,
      aiConfigReady,
    });

    return (
      <div className="popup-content">
        {/* Playground Component */}
        <div className="playground-component">
          {configReady && aiConfigReady ? (
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
          ) : (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p>
                {!configReady
                  ? 'Please configure your AI settings to use the playground.'
                  : 'Initializing AI configuration...'}
              </p>
            </div>
          )}
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
