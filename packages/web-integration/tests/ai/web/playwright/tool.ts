import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { WebPage } from '@/common/page';
import { getElementsInfo } from '@/debug';
import { saveBase64Image } from '@midscene/shared/img';
import { processImageElementInfo } from '@midscene/shared/img';
import { resizeImgBase64 } from '@midscene/shared/img';
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
  } = await getElementsInfo(page);

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

  const resizedImgBase64 = await resizeImgBase64(inputImgBase64, undefined);

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
      base64Data: resizedImgBase64,
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
    `tests/ai/inspector/test-data/${testDataName}`,
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
