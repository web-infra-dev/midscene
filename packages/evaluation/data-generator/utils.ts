import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { NodeType } from '@midscene/shared/constants';

import path from 'node:path';
import type { WebPage } from '@midscene/web';

import type { ElementInfo } from '@midscene/shared/extractor';

export function generateTestDataPath(testDataName: string) {
  assert(testDataName, 'testDataName is required');
  const midsceneTestDataPath = path.join(
    __dirname,
    `../page-data/${testDataName}`,
  );

  return midsceneTestDataPath;
}

function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  if (existsSync(dirname)) {
    return;
  }
  ensureDirectoryExistence(dirname);
  mkdirSync(dirname);
}

type WriteFileSyncParams = Parameters<typeof writeFileSync>;

export function writeFileSyncWithDir(
  filePath: string,
  content: WriteFileSyncParams[1],
  options: WriteFileSyncParams[2] = {},
) {
  ensureDirectoryExistence(filePath);
  writeFileSync(filePath, content, options);
}

export async function getElementsInfo(page: WebPage) {
  const captureElementSnapshot: Array<ElementInfo> =
    await page.getElementsInfo();

  const elementTree = await page.getElementsNodeTree();

  const elementsPositionInfoWithoutText = captureElementSnapshot.filter(
    (elementInfo) => {
      if (elementInfo.attributes.nodeType === NodeType.TEXT) {
        return false;
      }
      return true;
    },
  );
  return {
    elementsPositionInfo: captureElementSnapshot,
    elementTree,
    captureElementSnapshot,
    elementsPositionInfoWithoutText,
  };
}
