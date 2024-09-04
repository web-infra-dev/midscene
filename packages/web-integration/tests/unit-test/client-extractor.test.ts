import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AppiumPage } from '../../src/appium';

const iosXmlPath = join(
  __dirname,
  './fixtures/client-extractor/ios-setting.xml',
);
const androidXmlPath = join(
  __dirname,
  './fixtures/client-extractor/android-setting.xml',
);

class Browser {
  xmlPath: string;
  windowSize: { width: number; height: number };
  constructor(xmlPath: string, windowSize: { width: number; height: number }) {
    this.xmlPath = xmlPath;
    this.windowSize = windowSize;
  }
  getWindowSize() {
    return Promise.resolve(this.windowSize);
  }
  getPageSource() {
    return Promise.resolve(readFileSync(this.xmlPath, 'utf-8'));
  }
}

class AndroidBrowser {
  getWindowSize() {
    return Promise.resolve({
      width: 430,
      height: 932,
    });
  }
  getPageSource() {
    return Promise.resolve(readFileSync(androidXmlPath, 'utf-8'));
  }
}

describe(
  'extractor',
  () => {
    it('ios', async () => {
      const browser = new Browser(iosXmlPath, {
        width: 430,
        height: 932,
      }) as unknown as import('webdriverio').Browser;
      const page = new AppiumPage(browser);
      const infos = await page.getElementInfos();
      expect(infos).toMatchSnapshot();
    });
    it('android', async () => {
      const browser = new Browser(androidXmlPath, {
        width: 1080,
        height: 2400,
      }) as unknown as import('webdriverio').Browser;
      const page = new AppiumPage(browser);
      const infos = await page.getElementInfos();
      expect(infos).toMatchSnapshot();
    });
  },
  {
    timeout: 90 * 1000,
  },
);
