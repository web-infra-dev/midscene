import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { processImageElementInfo } from '@/img/img';
import { getElementInfos } from '@/img/util';
import { resizeImg, saveBase64Image } from '@midscene/core/image';
import type { Page as PlaywrightPage } from '@playwright/test';

export async function generateTestData(
  page: PlaywrightPage,
  targetDir: string,
  inputImgBase64: string,
) {
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

  const resizeImgBase64 = await resizeImg(inputImgBase64);

  writeFileSyncWithDir(
    snapshotJsonPath,
    JSON.stringify(captureElementSnapshot, null, 2),
  );
  await saveBase64Image({
    base64Data: inputImgBase64,
    outputPath: inputImagePath,
  });
  await saveBase64Image({
    base64Data: compositeElementInfoImgBase64,
    outputPath: outputImagePath,
  });
  await saveBase64Image({
    base64Data: compositeElementInfoImgWithoutTextBase64,
    outputPath: outputWithoutTextImgPath,
  });
  await saveBase64Image({
    base64Data: resizeImgBase64,
    outputPath: resizeOutputImgPath,
  });
}

export function generateTestDataPath(testDataName: string) {
  // `dist/lib/index.js` Is the default export path
  const modulePath = require
    .resolve('@midscene/core')
    .replace('dist/lib/index.js', '');
  const midsceneTestDataPath = path.join(
    modulePath,
    `tests/ai-model/inspector/test-data/${testDataName}`,
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
