import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage, KeyInput } from 'puppeteer';

export type WebPage = PlaywrightPage | PuppeteerPage;
export type WebKeyInput = KeyInput;
