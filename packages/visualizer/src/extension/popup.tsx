/// <reference types="chrome" />
import { Button, ConfigProvider, message } from 'antd';
import ReactDOM from 'react-dom/client';
import './popup.less';

import {
  type WorkerRequestSaveContext,
  type WorkerResponseSaveContext,
  activeTabId,
  currentWindowId,
  getPlaygroundUrl,
  sendToWorker,
  workerMessageTypes,
} from './utils';

import { globalThemeConfig } from '@/component/color';
import Logo from '@/component/logo';
import { Playground } from '@/component/playground-component';
import { SendOutlined } from '@ant-design/icons';
import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';
import { useEffect, useState } from 'react';

const shotAndOpenPlayground = async (tabId: number, windowId: number) => {
  const page = new ChromeExtensionProxyPage(tabId, windowId);
  const agent = new ChromeExtensionProxyPageAgent(page);
  const context = await agent.getUIContext();
  console.log('will cache context', context);

  // // cache screenshot when page is active
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
  const [agent, setAgent] = useState<ChromeExtensionProxyPageAgent | null>(
    null,
  );
  const [tabId, setTabId] = useState<number | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);

  useEffect(() => {
    console.log('useEffect in PlaygroundPopup');
    const initAgent = async () => {
      const tabId = await activeTabId();
      const windowId = await currentWindowId();
      setTabId(tabId);
      setWindowId(windowId);
      const page = new ChromeExtensionProxyPage(tabId, windowId);
      setAgent(new ChromeExtensionProxyPageAgent(page));
    };
    initAgent();
  }, []);

  const handleSendToPlayground = async () => {
    if (!tabId || !windowId) {
      message.error('No active tab or window found');
      return;
    }
    setLoading(true);
    try {
      await shotAndOpenPlayground(tabId, windowId);
    } catch (e: any) {
      message.error(e.message || 'Failed to launch Playground');
    }
    setLoading(false);
  };

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <div className="popup-wrapper">
        <div>
          <Logo />
        </div>
        <p>
          Midscene.js helps to automate browser actions, perform assertions, and
          extract data in JSON format using natural language.{' '}
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
        <div className="hr" />
        <div className="popup-playground-container">
          <Playground hideLogo agent={agent} showContextPreview={false} />
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
