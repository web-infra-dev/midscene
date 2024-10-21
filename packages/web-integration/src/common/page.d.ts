import type { KeyInput } from 'puppeteer';
import type { AppiumPage } from '../appium';
import type { StaticPage } from '../playground';
import type { PlaywrightWebPage } from '../playwright';
import type { PuppeteerWebPage } from '../puppeteer';

export type WebPage =
  | PlaywrightWebPage
  | PuppeteerWebPage
  | AppiumPage
  | StaticPage;
export type WebKeyInput = KeyInput;
