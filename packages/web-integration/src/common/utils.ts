import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ElementInfo } from '@/extractor';
import type { PlaywrightParserOpt, UIContext } from '@midscene/core';
import { uuid } from '@midscene/shared/.';
import { NodeType } from '@midscene/shared/constants';
import { findNearestPackageJson } from '@midscene/shared/fs';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { compositeElementInfoImg } from '@midscene/shared/img';
import dayjs from 'dayjs';
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
  if ((page as any)._forceUsePageContext) {
    return await (page as any)._forceUsePageContext();
  }
  const url = page.url();

  const screenshotBase64 = await page.screenshotBase64();
  const captureElementSnapshot = await page.getElementInfos();

  // align element
  const elementsInfo = await alignElements(captureElementSnapshot, page);

  const elementsPositionInfoWithoutText = elementsInfo.filter((elementInfo) => {
    if (elementInfo.attributes.nodeType === NodeType.TEXT) {
      return false;
    }
    return true;
  });

  const size = await imageInfoOfBase64(screenshotBase64);

  // composite element infos to screenshot
  const screenshotBase64WithElementMarker = await compositeElementInfoImg({
    inputImgBase64: screenshotBase64.split(';base64,').pop() as string,
    elementsPositionInfo: elementsPositionInfoWithoutText,
  });

  return {
    content: elementsInfo,
    size,
    screenshotBase64,
    screenshotBase64WithElementMarker: `data:image/png;base64,${screenshotBase64WithElementMarker}`,
    url,
  };
}

export async function getExtraReturnLogic() {
  const pathDir = findNearestPackageJson(__dirname);
  assert(pathDir, `can't find pathDir, with ${__dirname}`);
  const scriptPath = path.join(pathDir, './dist/script/htmlElement.js');
  const elementInfosScriptContent = readFileSync(scriptPath, 'utf-8');
  return `${elementInfosScriptContent}midscene_element_inspector.webExtractTextWithPosition()`;
}

const sizeThreshold = 3;
async function alignElements(
  elements: ElementInfo[],
  page: WebPage,
): Promise<WebElementInfo[]> {
  const validElements = elements.filter((item) => {
    return (
      item.rect.height >= sizeThreshold && item.rect.width >= sizeThreshold
    );
  });
  const textsAligned: WebElementInfo[] = [];
  for (const item of validElements) {
    const { rect, id, content, attributes, locator, indexId } = item;
    textsAligned.push(
      new WebElementInfo({
        rect,
        locator,
        id,
        content,
        attributes,
        page,
        indexId,
      }),
    );
  }

  return textsAligned;
}

export function reportFileName(tag = 'web') {
  const dateTimeInFileName = dayjs().format('YYYY-MM-DD_HH-mm-ss-SSS');
  return `${tag}-${dateTimeInFileName}`;
}

export function printReportMsg(filepath: string) {
  console.log('Midscene - report file updated:', filepath);
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

/**
 * Generates a unique cache ID based on the current execution file and a counter.
 *
 * This function creates a cache ID by combining the name of the current execution file
 * (typically a test or spec file) with an incrementing index. This ensures that each
 * cache ID is unique within the context of a specific test file across multiple executions.
 *
 * The function uses a Map to keep track of the index for each unique file, incrementing
 * it with each call for the same file.
 *
 * @returns {string} A unique cache ID in the format "filename-index"
 *
 * @example
 * // First call for "example.spec.ts"
 * generateCacheId(); // Returns "example.spec.ts-1"
 *
 * // Second call for "example.spec.ts"
 * generateCacheId(); // Returns "example.spec.ts-2"
 *
 * // First call for "another.test.ts"
 * generateCacheId(); // Returns "another.test.ts-1"
 */

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
