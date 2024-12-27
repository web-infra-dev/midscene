/// <reference types="chrome" />
import { Button, ConfigProvider, message } from 'antd';
import ReactDOM from 'react-dom/client';
import './popup.less';

import {
  type WorkerRequestSaveContext,
  type WorkerResponseSaveContext,
  getExtensionVersion,
  getPlaygroundUrl,
  sendToWorker,
  workerMessageTypes,
} from './utils';

import { globalThemeConfig } from '@/component/color';
import Logo from '@/component/logo';
import {
  Playground,
  extensionAgentForTabId,
} from '@/component/playground-component';
import { useChromeTabInfo } from '@/component/store';
import { SendOutlined } from '@ant-design/icons';
import type { ChromeExtensionProxyPageAgent } from '@midscene/web/chrome-extension';
import { useEffect, useState } from 'react';
import Bridge from './bridge';

const shotAndOpenPlayground = async (
  agent?: ChromeExtensionProxyPageAgent | null,
) => {
  if (!agent) {
    message.error('No agent found');
    return;
  }
  const context = await agent.getUIContext();

  // cache screenshot when page is active
  const { id } = await sendToWorker<
    WorkerRequestSaveContext,
    WorkerResponseSaveContext
  >(workerMessageTypes.SAVE_CONTEXT, {
    context,
  });
  const url = getPlaygroundUrl(id);
  chrome.tabs.create({
    url,
    active: true,
  });
};

function PlaygroundPopup() {
  const [loading, setLoading] = useState(false);
  const extensionVersion = getExtensionVersion();
  const { tabId, windowId } = useChromeTabInfo();

  const handleSendToPlayground = async () => {
    if (!tabId || !windowId) {
      message.error('No active tab or window found');
      return;
    }
    setLoading(true);
    try {
      const agent = extensionAgentForTabId(tabId);
      await shotAndOpenPlayground(agent);
      await agent!.page.destroy();
    } catch (e: any) {
      message.error(e.message || 'Failed to launch Playground');
    }
    setLoading(false);
  };

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <div className="popup-wrapper">
        <div className="popup-header">
          <Logo />
          <p>
            Midscene.js helps to automate browser actions, perform assertions,
            and extract data in JSON format using natural language.{' '}
            <a href="https://midscenejs.com/" target="_blank" rel="noreferrer">
              Learn more
            </a>
          </p>
          <p>This is a panel for experimenting with Midscene.js.</p>
          <p>
            To keep the current page context, you can also{' '}
            <Button
              onClick={handleSendToPlayground}
              loading={loading}
              type="link"
              size="small"
              icon={<SendOutlined />}
            >
              send to fullscreen playground
            </Button>
          </p>
        </div>

        <Bridge />
        <div className="hr" />
        <div className="popup-playground-container">
          <Playground
            hideLogo
            getAgent={() => {
              return extensionAgentForTabId(tabId);
            }}
            showContextPreview={false}
          />
        </div>
        <div className="popup-footer">
          <p>Midscene.js Chrome Extension v{extensionVersion}</p>
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
