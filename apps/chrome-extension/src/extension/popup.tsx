/// <reference types="chrome" />
import { ApiOutlined, SendOutlined } from '@ant-design/icons';
import {
  Logo,
  Playground,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer/extension';
import '@midscene/visualizer/extension.css';
import { ConfigProvider, Tabs } from 'antd';
import { getExtensionVersion } from '../utils';
import Bridge from './bridge';
import './popup.less';
import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';

// remember to destroy the agent when the tab is destroyed: agent.page.destroy()
const extensionAgentForTab = (forceSameTabNavigation = true) => {
  const page = new ChromeExtensionProxyPage(forceSameTabNavigation);
  return new ChromeExtensionProxyPageAgent(page);
};

declare const __SDK_VERSION__: string;

export function PlaygroundPopup() {
  const extensionVersion = getExtensionVersion();
  const { popupTab, setPopupTab } = useEnvConfig();

  const items = [
    {
      key: 'playground',
      label: 'Playground',
      icon: <SendOutlined />,
      children: (
        <div className="popup-playground-container">
          <Playground
            hideLogo
            getAgent={(forceSameTabNavigation?: boolean) => {
              return extensionAgentForTab(forceSameTabNavigation);
            }}
            showContextPreview={false}
          />
        </div>
      ),
    },
    {
      key: 'bridge',
      label: 'Bridge Mode',
      children: (
        <div className="popup-bridge-container">
          <Bridge />
        </div>
      ),
      icon: <ApiOutlined />,
    },
  ];

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <div className="popup-wrapper">
        <div className="popup-header">
          <Logo withGithubStar={true} />
          <p>
            AI-Driven Browser Automation with Chrome Extensions, JavaScript, and
            YAML Scripts.{' '}
            <a href="https://midscenejs.com/" target="_blank" rel="noreferrer">
              Learn more
            </a>
          </p>
        </div>
        <div className="tabs-container">
          <Tabs
            defaultActiveKey="playground"
            activeKey={popupTab}
            items={items}
            onChange={(key) => setPopupTab(key as 'playground' | 'bridge')}
          />
        </div>

        <div className="popup-footer">
          <p>
            Midscene.js Chrome Extension v{extensionVersion} (SDK v
            {__SDK_VERSION__})
          </p>
        </div>
      </div>
    </ConfigProvider>
  );
}
