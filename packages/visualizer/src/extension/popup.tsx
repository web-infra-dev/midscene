/// <reference types="chrome" />
import { Button, ConfigProvider, message } from 'antd';
import ReactDOM from 'react-dom/client';
import './popup.less';

import {
  type WorkerRequestSaveScreenshot,
  type WorkerResponseSaveScreenshot,
  activeTabId,
  currentWindowId,
  getPlaygroundUrl,
  // getScreenInfoOfTab,
  // getScreenshotBase64,
  sendToWorker,
  workerMessageTypes,
} from './utils';

import { globalThemeConfig } from '@/component/color';
import Logo from '@/component/logo';
import { Playground } from '@/component/playground-component';
import { resizeImgBase64 } from '@midscene/shared/browser/img';
import {
  ChromeExtensionProxyPage,
  ChromeExtensionProxyPageAgent,
} from '@midscene/web/chrome-extension';
import { useEffect, useState } from 'react';

const shotAndOpenPlayground = async (tabId: number, windowId: number) => {
  // let screenshot = await getScreenshotBase64(windowId);
  // const screenInfo = await getScreenInfoOfTab(tabId);

  // if (screenInfo.dpr > 1) {
  //   screenshot = (await resizeImgBase64(screenshot, {
  //     width: screenInfo.width,
  //     height: screenInfo.height,
  //   })) as string;
  // }
  // // cache screenshot when page is active
  // await sendToWorker<WorkerRequestSaveScreenshot, WorkerResponseSaveScreenshot>(
  //   workerMessageTypes.SAVE_SCREENSHOT,
  //   {
  //     screenshot: { base64: screenshot, dpr: screenInfo.dpr },
  //     tabId,
  //     windowId,
  //   },
  // );
  const url = getPlaygroundUrl(tabId, windowId);
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
          >
            send to fullscreen playground
          </Button>
        </p>
        <div className="hr" />
        <Playground liteUI agent={agent} />
      </div>
    </ConfigProvider>
  );
}

const element = document.getElementById('root');
if (element) {
  const root = ReactDOM.createRoot(element);
  root.render(<PlaygroundPopup />);
}
