// import { readFileSync } from 'fs';
// import { Buffer } from 'buffer';
// import assert from 'assert';
// import type { Browser, Page } from 'puppeteer';
// import type { Page as PlaywrightPage } from 'playwright';
// import { Element } from './index';
// import { alignCoordByTrim, base64Encoded, imageInfoOfBase64 } from '@/image';
// import { UIContext, PuppeteerParserOpt, PlaywrightParserOpt, Rect, BaseElement } from '@/types';
// import { getTmpFile } from '@/utils';
// import { pageScriptToGetTexts } from '@/query';
// import { describeUserPage } from '@/insight/prompt';

// export interface TextElement {
//   content: string;
//   rect: Rect;
//   center: [number, number]; // center coordinates as [rect.left + rect.width/2, rect.top + rect.height/2], use this for better control of page
//   locator: string;
// }

// export async function alignTextElements(
//   screenshotBuffer: Buffer,
//   elements: TextElement[],
// ): Promise<TextElement[]> {
//   const textsAligned: TextElement[] = [];
//   for (const item of elements) {
//     const { rect } = item;
//     const aligned = await alignCoordByTrim(screenshotBuffer, rect);
//     item.rect = aligned;
//     item.center = [
//       Math.round(aligned.left + aligned.width / 2),
//       Math.round(aligned.top + aligned.height / 2),
//     ];
//     textsAligned.push(item);
//   }
//   return textsAligned;
// }

// async function extractDataFromPage(page: Page, opt?: PuppeteerParserOpt): Promise<UIContext<Element>> {
//   assert(page, 'page is required');
//   const file = getTmpFile('jpeg');
//   await page.screenshot({ path: file, type: 'jpeg', quality: 75 });
//   const screenshotBuffer = readFileSync(file);
//   const screenshotBase64 = base64Encoded(file);
//   const size = await imageInfoOfBase64(screenshotBase64);

//   const scripts = pageScriptToGetTexts(opt?.selector);
//   const texts = (await page.evaluate(scripts)) as BaseElement[];

//   // align texts
//   const textsAligned = await alignTextElements(screenshotBuffer, texts);

//   const baseElements = textsAligned.map((item) => {
//     const { center, ...res } = item;
//     return new Element(res);
//   });

//   const basicContext = {
//     screenshotBase64,
//     size,
//     content: baseElements,
//   };

//   return {
//     ...basicContext,
//     describer: async () => {
//       return describeUserPage(basicContext);
//     },
//   };
// }

// export async function parseContextFromPuppeteerPage(
//   page: Page,
//   opt?: PuppeteerParserOpt,
// ): Promise<UIContext<Element>> {
//   return extractDataFromPage(page, opt);
// }

// export async function parseContextFromPuppeteerBrowser(browser: Browser): Promise<UIContext<Element>> {
//   const pages = await browser.pages();
//   let visiblePage: Page;
//   if (!pages.length) {
//     throw new Error('No page found in the puppeteer browser');
//   } else if (pages.length === 1) {
//     visiblePage = pages[0];

//     // filter a visible page, otherwise use the last one
//   } else {
//     const candidates = [];
//     for (const page of pages) {
//       // eslint-disable-next-line @typescript-eslint/no-loop-func
//       const isVisible = await page.evaluate(() => document.visibilityState === 'visible');
//       if (isVisible) {
//         candidates.push(page);
//       }
//     }
//     if (candidates.length === 0) {
//       const lastUrl = pages[pages.length - 1].url();
//       console.warn(`There are no visible pages, use the last one (${lastUrl})`);
//       visiblePage = candidates[candidates.length - 1];
//     } else if (candidates.length === 1) {
//       visiblePage = candidates[0];
//     } else {
//       const lastUrl = pages[pages.length - 1].url();
//       console.warn(`Multiple visible pages found, use the last one (${lastUrl})`);
//       visiblePage = candidates[candidates.length - 1];
//     }
//   }
//   return parseContextFromPuppeteerPage(visiblePage);
// }

// export async function parseContextFromPlaywrightPage(
//   page: PlaywrightPage,
//   opt?: PlaywrightParserOpt,
// ): Promise<UIContext<Element>> {
//   return extractDataFromPage(page as any as Page, opt); // seems key APIs are the same ?
// }
