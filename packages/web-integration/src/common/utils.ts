import assert from 'node:assert';
import type { Buffer } from 'node:buffer';
import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import type { PlaywrightParserOpt, UIContext } from '@midscene/core';
import {
  alignCoordByTrim,
  base64Encoded,
  imageInfoOfBase64,
} from '@midscene/core/image';
import { getTmpFile } from '@midscene/core/utils';
import { WebElementInfo, type WebElementInfoType } from '../web-element';
import type { WebPage } from './page';

export type WebUIContext = UIContext<WebElementInfo> & {
  url: string;
};

export async function parseContextFromWebPage(
  page: WebPage,
  _opt?: PlaywrightParserOpt,
): Promise<WebUIContext> {
  assert(page, 'page is required');

  const url = page.url();
  const file = getTmpFile('jpeg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 75 });
  const screenshotBuffer = readFileSync(file);
  const screenshotBase64 = base64Encoded(file);
  const captureElementSnapshot = await getElementInfosFromPage(page);
  // align element
  const elementsInfo = await alignElements(
    screenshotBuffer,
    captureElementSnapshot,
    page,
  );
  const size = await imageInfoOfBase64(screenshotBase64);

  return {
    content: elementsInfo,
    size,
    screenshotBase64,
    url,
  };
}

export async function getElementInfosFromPage(page: WebPage) {
  const pathDir = findNearestPackageJson(__dirname);
  assert(pathDir, `can't find pathDir, with ${__dirname}`);
  const scriptPath = path.join(pathDir, './dist/script/htmlElement.js');
  const elementInfosScriptContent = readFileSync(scriptPath, 'utf-8');
  const extraReturnLogic = `${elementInfosScriptContent}midscene_element_inspector.extractTextWithPosition()`;

  const captureElementSnapshot = await (page as any).evaluate(extraReturnLogic);
  return captureElementSnapshot;
}

const sizeThreshold = 3;
async function alignElements(
  screenshotBuffer: Buffer,
  elements: WebElementInfoType[],
  page: WebPage,
): Promise<WebElementInfo[]> {
  const textsAligned: WebElementInfo[] = [];
  const validElements = elements.filter((item) => {
    return (
      item.rect.height >= sizeThreshold && item.rect.width >= sizeThreshold
    );
  });
  for (const item of validElements) {
    const { rect } = item;

    const aligned = await alignCoordByTrim(screenshotBuffer, rect);
    item.rect = aligned;
    item.center = [
      Math.round(aligned.left + aligned.width / 2),
      Math.round(aligned.top + aligned.height / 2),
    ];
    textsAligned.push(
      new WebElementInfo({
        ...item,
        page,
      }),
    );
  }
  return textsAligned;
}

/**
 * Find the nearest package.json file recursively
 * @param {string} dir - Home directory
 * @returns {string|null} - The most recent package.json file path or null
 */
export function findNearestPackageJson(dir: string): string | null {
  const packageJsonPath = path.join(dir, 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    return dir;
  }

  const parentDir = path.dirname(dir);

  // Return null if the root directory has been reached
  if (parentDir === dir) {
    return null;
  }

  return findNearestPackageJson(parentDir);
}
