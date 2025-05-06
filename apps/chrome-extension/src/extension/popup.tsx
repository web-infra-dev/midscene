/// <reference types="chrome" />
import { HomeOutlined } from '@ant-design/icons';
import {
  EnvConfig,
  GithubStar,
  globalThemeConfig,
  useEnvConfig,
} from '@midscene/visualizer';
import '@midscene/visualizer/index.css';
import { ConfigProvider } from 'antd';
import { SeniorShopper } from '../component/SeniorShopper';
import { getExtensionVersion } from '../utils';
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
            <EnvConfig showTooltipWhenEmpty={true} />
          </div>
          <p>
            AI Shopping Assistant for Seniors.{' '}
            <a href="https://midscenejs.com/" target="_blank" rel="noreferrer">
              Learn more
            </a>
          </p>
        </div>

        <div className="popup-content">
          <SeniorShopper
            getAgent={(forceSameTabNavigation?: boolean) => {
              return extensionAgentForTab(forceSameTabNavigation);
            }}
            showContextPreview={false}
          />
        </div>

        <div className="popup-footer">
          <p>
            SeniorShopper Extension v{extensionVersion} (SDK v
            {__SDK_VERSION__})
          </p>
        </div>
      </div>
    </ConfigProvider>
  );
}
