/// <reference types="chrome" />
import { Button, ConfigProvider, message } from 'antd';
import ReactDOM from 'react-dom/client';
import './popup.less';

import {
  type WorkerRequestSaveScreenshot,
  type WorkerResponseSaveScreenshot,
  getPlaygroundUrl,
  getScreenInfoOfTab,
  getScreenshotBase64,
  sendToWorker,
  workerMessageTypes,
} from './utils';

import { globalThemeConfig } from '@/component/color';
import Logo from '@/component/logo';
import { Playground } from '@/component/playground-component';
import { resizeImgBase64 } from '@midscene/shared/browser/img';
import { useState } from 'react';

async function getTabId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs?.[0]?.id) {
        resolve(tabs[0].id);
      } else {
        reject(new Error('No active tab found'));
      }
    });
  });
}

async function getWindowId(): Promise<number> {
  return new Promise((resolve, reject) => {
    chrome.windows.getCurrent((window) => {
      if (window?.id) {
        resolve(window.id);
      } else {
        reject(new Error('No active window found'));
      }
    });
  });
}

const shotAndOpenPlayground = async () => {
  const tabId = await getTabId();
  const windowId = await getWindowId();

  console.time('shotAndOpenPlayground');

  console.time('getScreenshotBase64');
  let screenshot = await getScreenshotBase64(windowId);
  console.timeEnd('getScreenshotBase64');
  const screenInfo = await getScreenInfoOfTab(tabId);

  console.time('resizeImgBase64');
  if (screenInfo.dpr > 1) {
    screenshot = (await resizeImgBase64(screenshot, {
      width: screenInfo.width,
      height: screenInfo.height,
    })) as string;
  }
  console.timeEnd('resizeImgBase64');
  // cache screenshot when page is active
  console.time('sendToWorker');
  await sendToWorker<WorkerRequestSaveScreenshot, WorkerResponseSaveScreenshot>(
    workerMessageTypes.SAVE_SCREENSHOT,
    {
      screenshot: { base64: screenshot, dpr: screenInfo.dpr },
      tabId,
      windowId,
    },
  );
  console.timeEnd('sendToWorker');
  const url = getPlaygroundUrl(tabId, windowId);
  chrome.tabs.create({
    url,
    active: true,
  });
  console.timeEnd('shotAndOpenPlayground');
};

function PlaygroundPopup() {
  const [loading, setLoading] = useState(false);

  const handleSendToPlayground = async () => {
    setLoading(true);
    try {
      await shotAndOpenPlayground();
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
            type="text"
          >
            send to fullscreen playground
          </Button>
        </p>
        <div className="hr" />
        <Playground liteUI />
      </div>
    </ConfigProvider>
  );
}

const element = document.getElementById('root');
if (element) {
  const root = ReactDOM.createRoot(element);
  root.render(<PlaygroundPopup />);
}
