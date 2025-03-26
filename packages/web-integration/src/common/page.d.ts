import type { KeyInput } from 'puppeteer';
import type ChromeExtensionProxyPage from '../chrome-extension/page';
import type { StaticPage } from '../playground';
import type { PlaywrightWebPage } from '../playwright';
import type { PuppeteerWebPage } from '../puppeteer';

export type WebPage =
  | PlaywrightWebPage
  | PuppeteerWebPage
  | StaticPage
  | ChromeExtensionProxyPage;
export type WebKeyInput = KeyInput;
