import type { KeyInput } from 'puppeteer';
import type { AppiumPage } from '../appium';
import type { PlaywrightPage } from '../playwright';
import type { PuppeteerPage } from '../puppeteer';

export type WebPage = PlaywrightPage | PuppeteerPage | AppiumPage;
export type WebKeyInput = KeyInput;
