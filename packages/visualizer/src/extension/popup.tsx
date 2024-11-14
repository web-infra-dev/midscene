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

const useExtensionAgent = (tabId: number | null, windowId: number | null) => {
  const [agent, setAgent] = useState<ChromeExtensionProxyPageAgent | null>(
    null,
  );

  useEffect(() => {
    if (!tabId || !windowId) {
      return;
    }
    const page = new ChromeExtensionProxyPage(tabId, windowId);
    const agent = new ChromeExtensionProxyPageAgent(page);
    setAgent(agent);

    return () => {
      console.log('will destroy agent for TabId', tabId, 'WindowId', windowId);
      agent.page.destroy();
    };
  }, [tabId, windowId]);

  return agent;
};

function PlaygroundPopup() {
  const [loading, setLoading] = useState(false);
  const [tabId, setTabId] = useState<number | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const agent = useExtensionAgent(tabId, windowId);

  useEffect(() => {
    Promise.resolve().then(async () => {
      const tabId = await activeTabId();
      const windowId = await currentWindowId();
      setTabId(tabId);
      setWindowId(windowId);

      chrome.tabs.onActivated.addListener(async (activeInfo) => {
        const tabId = activeInfo.tabId;
        const windowId = await currentWindowId();
        setTabId(tabId);
        setWindowId(windowId);
      });
    });
  }, []);

  const handleSendToPlayground = async () => {
    if (!tabId || !windowId) {
      message.error('No active tab or window found');
      return;
    }
    setLoading(true);
    try {
      await shotAndOpenPlayground(agent);
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
