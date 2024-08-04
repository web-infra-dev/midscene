import type { Page as PlaywrightPage } from 'playwright';
import type { KeyInput, Page as PuppeteerPage } from 'puppeteer';

export type WebPage = PlaywrightPage | PuppeteerPage;
export type WebKeyInput = KeyInput;
