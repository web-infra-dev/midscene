/// <reference types="chrome" />
import {
  ApiOutlined,
  HomeOutlined,
  SendOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import {
  EnvConfig,
  GithubStar,
  Logo,
  globalThemeConfig,
} from '@midscene/visualizer';
import '@midscene/visualizer/index.css';
import { ConfigProvider, Tabs } from 'antd';
import { BrowserExtensionPlayground } from '../component/playground';
import { useEnvConfig } from '../store';
import { getExtensionVersion } from '../utils';
import Bridge from './bridge';
import Record from './record';
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
          <BrowserExtensionPlayground
            getAgent={(forceSameTabNavigation?: boolean) => {
              return extensionAgentForTab(forceSameTabNavigation);
            }}
            showContextPreview={false}
          />
        </div>
      ),
    },
    {
      key: 'record',
      label: 'Record',
      icon: <VideoCameraOutlined />,
      children: <Record />,
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            <a
              style={{
                color: 'unset',
              }}
              href="https://midscenejs.com/"
              target="_blank"
              rel="noreferrer"
            >
              <HomeOutlined
                style={{
                  fontSize: '20px',
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              />
            </a>
            <GithubStar />
            <EnvConfig showTooltipWhenEmpty={popupTab === 'playground'} />
          </div>
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
            onChange={(key) =>
              setPopupTab(key as 'playground' | 'bridge' | 'record')
            }
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
