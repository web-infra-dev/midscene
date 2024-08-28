import type { Page as PlaywrightPage } from 'playwright';
import type { KeyInput, Page as PuppeteerPage } from 'puppeteer';

export type WebPage = (PlaywrightPage | PuppeteerPage) & {
  evaluate<R, Arg>(pageFunction: PageFunction<Arg, R>, arg?: Arg): Promise<R>;
};
export type WebKeyInput = KeyInput;
