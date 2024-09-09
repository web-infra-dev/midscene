import type { KeyInput } from 'puppeteer';
import type { AppiumPage } from '../appium';
import type { PlaywrightPage } from '../playwright';
import type { PuppeteerWebPage } from '../puppeteer';

export type WebPage = PlaywrightPage | PuppeteerWebPage | AppiumPage;
export type WebKeyInput = KeyInput;
