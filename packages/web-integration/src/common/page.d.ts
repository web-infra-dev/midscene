import type { KeyInput } from 'puppeteer';
import type { AdbPage } from '../adb';
import type ChromeExtensionProxyPage from '../chrome-extension/page';
import type { StaticPage } from '../playground';
import type { PlaywrightWebPage } from '../playwright';
import type { PuppeteerWebPage } from '../puppeteer';

export type WebPage =
  | PlaywrightWebPage
  | PuppeteerWebPage
  | AdbPage
  | StaticPage
  | ChromeExtensionProxyPage;
export type WebKeyInput = KeyInput;
