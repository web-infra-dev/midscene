/// <reference types="chrome" />
import { Button } from 'antd';
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

import Logo from '@/component/logo';
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

  const handleClick = async () => {
    setLoading(true);
    await shotAndOpenPlayground();
    setLoading(false);
  };

  return (
    <div className="popup-wrapper">
      <div>
        <Logo />
      </div>
      <p>
        Using AI to automate browser actions, perform assertions, and extract
        data in JSON format using natural language.{' '}
        <a href="https://midscenejs.com/" target="_blank" rel="noreferrer">
          Learn more
        </a>
      </p>
      <Button onClick={handleClick} loading={loading} type="primary">
        Send to Playground
      </Button>
    </div>
  );
}

const element = document.getElementById('root');
if (element) {
  const root = ReactDOM.createRoot(element);
  root.render(<PlaygroundPopup />);
}
