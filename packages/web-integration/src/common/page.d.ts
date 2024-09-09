import type { KeyInput } from 'puppeteer';
import type { AppiumPage } from '../appium';
import type { PlaywrightWebPage } from '../playwright';
import type { PuppeteerWebPage } from '../puppeteer';

export type WebPage = PlaywrightWebPage | PuppeteerWebPage | AppiumPage;
export type WebKeyInput = KeyInput;
