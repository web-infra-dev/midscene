import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WebPage } from '@/common/page';
import type { ElementInfo } from '@/extractor';
import { NodeType } from '@/extractor/constants';
import {
  processImageElementInfo,
  resizeImg,
  saveBase64Image,
} from '@midscene/shared/img';

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
  const file = await page.screenshot();
  const screenshotBuffer = readFileSync(file);

  const inputImgBase64 = screenshotBuffer.toString('base64');

  const {
    elementsPositionInfo,
    captureElementSnapshot,
    elementsPositionInfoWithoutText,
  } = await getElementInfos(page);

  const inputImagePath = path.join(targetDir, 'input.png');
  const outputImagePath = path.join(targetDir, 'output.png');
  const outputWithoutTextImgPath = path.join(
    targetDir,
    'output_without_text.png',
  );
  const resizeOutputImgPath = path.join(targetDir, 'resize-output.png');
  const snapshotJsonPath = path.join(targetDir, 'element-snapshot.json');

  const {
    compositeElementInfoImgBase64,
    compositeElementInfoImgWithoutTextBase64,
  } = await processImageElementInfo({
    elementsPositionInfo,
    elementsPositionInfoWithoutText,
    inputImgBase64,
  });

  const resizeImgBase64 = (await resizeImg(inputImgBase64)) as string;

  const existingSnapshot = existsSync(snapshotJsonPath)
    ? JSON.parse(readFileSync(snapshotJsonPath, 'utf-8'))
    : null;

  if (
    existingSnapshot &&
    JSON.stringify(existingSnapshot) === JSON.stringify(captureElementSnapshot)
  ) {
    console.log('skip save snapshot for ', targetDir);
    return;
  }

  if (!saveImgType?.disableSnapshot) {
    writeFileSyncWithDir(
      snapshotJsonPath,
      JSON.stringify(captureElementSnapshot, null, 2),
    );
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
      base64Data: resizeImgBase64,
      outputPath: resizeOutputImgPath,
    });
  }
}

export function generateTestDataPath(testDataName: string) {
  // `dist/lib/index.js` Is the default export path
  const modulePath = require
    .resolve('@midscene/core')
    .replace('dist/lib/index.js', '');
  const midsceneTestDataPath = path.join(
    modulePath,
    `tests/ai/evaluate/test-data/${testDataName}`,
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

export async function getElementInfos(page: WebPage) {
  const captureElementSnapshot: Array<ElementInfo> =
    await page.getElementInfos();

  const elementsPositionInfo = captureElementSnapshot.map(
    (elementInfo, index) => {
      return {
        label: elementInfo.indexId?.toString() || index.toString(),
        x: elementInfo.rect.left,
        y: elementInfo.rect.top,
        width: elementInfo.rect.width,
        height: elementInfo.rect.height,
        attributes: elementInfo.attributes,
      };
    },
  );
  const elementsPositionInfoWithoutText = elementsPositionInfo.filter(
    (elementInfo) => {
      if (elementInfo.attributes.nodeType === NodeType.TEXT) {
        return false;
      }
      return true;
    },
  );
  return {
    elementsPositionInfo,
    captureElementSnapshot,
    elementsPositionInfoWithoutText,
  };
}
