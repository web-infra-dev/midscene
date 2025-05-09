import type { StaticPage } from '@/playground';
import type {
  ElementTreeNode,
  PlaywrightParserOpt,
  UIContext,
} from '@midscene/core';
import { uploadTestInfoToServer } from '@midscene/core/utils';
import { MIDSCENE_REPORT_TAG_NAME, getAIConfig } from '@midscene/shared/env';
import type { ElementInfo } from '@midscene/shared/extractor';
import { traverseTree, treeToList } from '@midscene/shared/extractor';
import { resizeImgBase64 } from '@midscene/shared/img';
import type { DebugFunction } from '@midscene/shared/logger';
import { assert, logMsg, uuid } from '@midscene/shared/utils';
import dayjs from 'dayjs';
import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';
import type { PlaywrightWebPage } from '../playwright';
import type { PuppeteerWebPage } from '../puppeteer';
import { WebElementInfo } from '../web-element';
import type { WebPage } from './page';

export type WebUIContext = UIContext<WebElementInfo> & {
  url: string;
};

export async function parseContextFromWebPage(
  page: WebPage,
  _opt?: PlaywrightParserOpt,
): Promise<WebUIContext> {
  assert(page, 'page is required');
  if ((page as StaticPage)._forceUsePageContext) {
    return await (page as any)._forceUsePageContext();
  }
  const url = await page.url();
  uploadTestInfoToServer({ testUrl: url });

  let screenshotBase64: string;
  let tree: ElementTreeNode<ElementInfo>;

  await Promise.all([
    page.screenshotBase64().then((base64) => {
      screenshotBase64 = base64;
    }),
    page.getElementsNodeTree().then(async (treeRoot) => {
      tree = treeRoot;
    }),
  ]);

  const webTree = traverseTree(tree!, (elementInfo) => {
    const { rect, id, content, attributes, locator, indexId } = elementInfo;
    return new WebElementInfo({
      rect,
      locator,
      id,
      content,
      attributes,
      indexId,
    });
  });

  assert(screenshotBase64!, 'screenshotBase64 is required');

  const elementsInfo = treeToList(webTree);
  const size = await page.size();

  if (size.dpr && size.dpr > 1) {
    // console.time('resizeImgBase64');
    screenshotBase64 = await resizeImgBase64(screenshotBase64, {
      width: size.width,
      height: size.height,
    });
    // console.timeEnd('resizeImgBase64');
  }

  return {
    content: elementsInfo!,
    tree: webTree,
    size,
    screenshotBase64: screenshotBase64!,
    url,
  };
}

export function reportFileName(tag = 'web') {
  const reportTagName = getAIConfig(MIDSCENE_REPORT_TAG_NAME);
  const dateTimeInFileName = dayjs().format('YYYY-MM-DD_HH-mm-ss');
  // ensure uniqueness at the same time
  const uniqueId = uuid().substring(0, 8);
  return `${reportTagName || tag}-${dateTimeInFileName}-${uniqueId}`;
}

export function printReportMsg(filepath: string) {
  logMsg(`Midscene - report file updated: ${filepath}`);
}

/**
 * Get the current execution file name
 * @returns The name of the current execution file
 */
export function getCurrentExecutionFile(trace?: string): string | false {
  const error = new Error();
  const stackTrace = trace || error.stack;
  const pkgDir = process.cwd() || '';
  if (stackTrace) {
    const stackLines = stackTrace.split('\n');
    for (const line of stackLines) {
      if (
        line.includes('.spec.') ||
        line.includes('.test.') ||
        line.includes('.ts') ||
        line.includes('.js')
      ) {
        const match = line.match(/(?:at\s+)?(.*?\.(?:spec|test)\.[jt]s)/);
        if (match?.[1]) {
          const targetFileName = match[1]
            .replace(pkgDir, '')
            .trim()
            .replace('at ', '');
          return targetFileName;
        }
      }
    }
  }
  return false;
}

const testFileIndex = new Map<string, number>();

export function generateCacheId(fileName?: string): string {
  let taskFile = fileName || getCurrentExecutionFile();
  if (!taskFile) {
    taskFile = uuid();
    console.warn(
      'Midscene - using random UUID for cache id. Cache may be invalid.',
    );
  }

  if (testFileIndex.has(taskFile)) {
    const currentIndex = testFileIndex.get(taskFile);
    if (currentIndex !== undefined) {
      testFileIndex.set(taskFile, currentIndex + 1);
    }
  } else {
    testFileIndex.set(taskFile, 1);
  }
  return `${taskFile}-${testFileIndex.get(taskFile)}`;
}

export const ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED =
  'NOT_IMPLEMENTED_AS_DESIGNED';

export function replaceIllegalPathCharsAndSpace(str: string) {
  return str.replace(/[/\\:*?"<>| ]/g, '-');
}

export function forceClosePopup(
  page: PuppeteerPage | PlaywrightPage,
  debug: DebugFunction,
) {
  page.on('popup', async (popup) => {
    if (!popup) {
      console.warn('got a popup event, but the popup is not ready yet, skip');
      return;
    }
    const url = await (popup as PuppeteerPage).url();
    console.log(`Popup opened: ${url}`);
    if (!(popup as PuppeteerPage).isClosed()) {
      try {
        await (popup as PuppeteerPage).close(); // Close the newly opened TAB
      } catch (error) {
        debug(`failed to close popup ${url}, error: ${error}`);
      }
    } else {
      debug(`popup is already closed, skip close ${url}`);
    }

    if (!page.isClosed()) {
      try {
        await page.goto(url);
      } catch (error) {
        debug(`failed to goto ${url}, error: ${error}`);
      }
    } else {
      debug(`page is already closed, skip goto ${url}`);
    }
  });
}

function replaceTextInXPath(xpath: string) {
  return xpath.replace('/text()', ''); // /text() can't get locator
}

export async function checkElementExistsByXPath(
  page: WebPage,
  xpaths: string[],
  logData: {
    type: string;
    userPrompt: string;
    debug: (...args: any[]) => void;
  },
): Promise<boolean> {
  const { type, userPrompt, debug } = logData;

  for (const xpath of xpaths) {
    if (page.pageType === 'playwright') {
      try {
        const playwrightPage = (page as PlaywrightWebPage).underlyingPage;
        const xpathLocator = playwrightPage.locator(
          `xpath=${replaceTextInXPath(xpath)}`,
        );
        const xpathCount = await xpathLocator.count();
        if (xpathCount === 1) {
          debug(
            'cache hit, type: %s, prompt: %s, xpath: %s',
            type,
            userPrompt,
            xpath,
          );
          const xpathElement = await xpathLocator.first();
          await xpathElement.evaluate((element: Element) => {
            element.scrollIntoView();
            element.setAttribute('data-midscene', 'cache-hit');
          });
          return true;
        }
      } catch (error) {
        debug('playwright xpath locator error', error);
      }
    } else if (page.pageType === 'puppeteer') {
      try {
        const puppeteerPage = (page as PuppeteerWebPage).underlyingPage;
        const xpathElements = await puppeteerPage.$$(
          `xpath=${replaceTextInXPath(xpath)}`,
        );
        if (xpathElements && xpathElements.length === 1) {
          debug(
            'cache hit, type: %s, prompt: %s, xpath: %s',
            type,
            userPrompt,
            xpath,
          );
          await xpathElements[0].evaluate((element: Element) => {
            element.scrollIntoView();
            element.setAttribute('data-midscene', 'cache-hit');
          });
          return true;
        }
      } catch (error) {
        debug('puppeteer xpath locator error', error);
      }
    } else {
      debug('unknown page type, will not match cache', {
        pageType: page.pageType,
      });
    }
  }

  debug('cannot match element with same id in current page');
  return false;
}
