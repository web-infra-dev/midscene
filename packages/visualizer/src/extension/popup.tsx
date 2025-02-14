/// <reference types="chrome" />
import { ConfigProvider, Tabs } from 'antd';
import ReactDOM from 'react-dom/client';
import { setSideEffect } from '../init';
import './popup.less';

import { globalThemeConfig } from '@/component/color';
import Logo from '@/component/logo';
import {
  Playground,
  extensionAgentForTab,
} from '@/component/playground-component';
import { useEnvConfig } from '@/component/store';
import { ApiOutlined, SendOutlined } from '@ant-design/icons';
import Bridge from './bridge';
import { getExtensionVersion } from './utils';

setSideEffect();

declare const __VERSION__: string;

function PlaygroundPopup() {
  const extensionVersion = getExtensionVersion();
  const { popupTab, setPopupTab, forceSameTabNavigation } = useEnvConfig();

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
            Midscene.js Chrome Extension v{extensionVersion} (SDK v{__VERSION__}
            )
          </p>
        </div>
      </div>
    </ConfigProvider>
  );
}

const element = document.getElementById('root');
if (element) {
  const root = ReactDOM.createRoot(element);
  root.render(<PlaygroundPopup />);
}

// const shotAndOpenPlayground = async (
//   agent?: ChromeExtensionProxyPageAgent | null,
// ) => {
//   if (!agent) {
//     message.error('No agent found');
//     return;
//   }
//   const context = await agent.getUIContext();

//   // cache screenshot when page is active
//   const { id } = await sendToWorker<
//     WorkerRequestSaveContext,
//     WorkerResponseSaveContext
//   >(workerMessageTypes.SAVE_CONTEXT, {
//     context,
//   });
//   const url = getPlaygroundUrl(id);
//   chrome.tabs.create({
//     url,
//     active: true,
//   });
// };

// const handleSendToPlayground = async () => {
//   if (!tabId || !windowId) {
//     message.error('No active tab or window found');
//     return;
//   }
//   setLoading(true);
//   try {
//     const agent = extensionAgentForTab(tabId);
//     await shotAndOpenPlayground(agent);
//     await agent!.page.destroy();
//   } catch (e: any) {
//     message.error(e.message || 'Failed to launch Playground');
//   }
//   setLoading(false);
// };
