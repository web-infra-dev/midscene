import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { NodeType } from '@midscene/shared/constants';

import path from 'node:path';
import { descriptionOfTree } from '@midscene/core/tree';
import {
  imageInfoOfBase64,
  processImageElementInfo,
  resizeImgBase64,
  saveBase64Image,
  zoomForGPT4o,
} from '@midscene/shared/img';
import type { WebPage } from '@midscene/web';

import { fileURLToPath } from 'node:url';
import type { ElementInfo } from '@midscene/shared/extractor';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateExtractData(
  page: WebPage,
  targetDir: string,
  saveImgType?: {
    disableInputImage: boolean;
    disableOutputImage: boolean;
    disableOutputWithoutTextImg: boolean;
    disableResizeOutputImg: boolean;
    disableSnapshot: boolean;
  },
) {
  const inputImgBase64 = await page.screenshotBase64();

  const {
    elementsPositionInfo,
    captureElementSnapshot,
    elementsPositionInfoWithoutText,
    elementTree,
  } = await getElementsInfo(page);

  const inputImagePath = path.join(targetDir, 'input.png');
  const outputImagePath = path.join(targetDir, 'output.png');
  const outputWithoutTextImgPath = path.join(
    targetDir,
    'output_without_text.png',
  );
  const resizeOutputImgPath = path.join(targetDir, 'resize-output.png');
  const snapshotJsonPath = path.join(targetDir, 'element-snapshot.json');
  const elementTreeJsonPath = path.join(targetDir, 'element-tree.json');
  const elementTreeTextText = descriptionOfTree(elementTree);
  const elementTreeTextPath = path.join(targetDir, 'element-tree.txt');
  const {
    compositeElementInfoImgBase64,
    compositeElementInfoImgWithoutTextBase64,
  } = await processImageElementInfo({
    elementsPositionInfo,
    elementsPositionInfoWithoutText,
    inputImgBase64,
  });

  const originalSize = await imageInfoOfBase64(inputImgBase64);
  const resizedImg = await resizeImgBase64(
    inputImgBase64,
    zoomForGPT4o(originalSize.width, originalSize.height),
  );

  if (!saveImgType?.disableSnapshot) {
    writeFileSyncWithDir(
      snapshotJsonPath,
      JSON.stringify(captureElementSnapshot, null, 2),
    );
    writeFileSyncWithDir(
      elementTreeJsonPath,
      JSON.stringify(elementTree, null, 2),
    );
    writeFileSyncWithDir(elementTreeTextPath, elementTreeTextText);
  }
  if (!saveImgType?.disableInputImage) {
    await saveBase64Image({
      base64Data: inputImgBase64,
      outputPath: inputImagePath,
    });
  }
  if (!saveImgType?.disableOutputImage) {
    await saveBase64Image({
      base64Data: compositeElementInfoImgBase64,
      outputPath: outputImagePath,
    });
  }
  if (!saveImgType?.disableOutputWithoutTextImg) {
    await saveBase64Image({
      base64Data: compositeElementInfoImgWithoutTextBase64,
      outputPath: outputWithoutTextImgPath,
    });
  }
  if (!saveImgType?.disableResizeOutputImg) {
    await saveBase64Image({
      base64Data: resizedImg,
      outputPath: resizeOutputImgPath,
    });
  }
}

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
