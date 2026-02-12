import { existsSync } from 'node:fs';
import path from 'node:path';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { imageInfoOfBase64, localImg2Base64 } from '@midscene/shared/img';

export async function buildContext(targetDir: string): Promise<UIContext> {
  const originalInputImgP = path.join(
    targetDir,
    existsSync(path.join(targetDir, 'input.png')) ? 'input.png' : 'input.jpeg',
  );
  const originalScreenshotBase64 = localImg2Base64(originalInputImgP);

  const size = await imageInfoOfBase64(originalScreenshotBase64);

  return {
    screenshot: ScreenshotItem.create(originalScreenshotBase64),
    shotSize: size,
    shrunkShotToLogicalRatio: 1,
  };
}

export const getContextFromFixture = async (
  pageName: string,
): Promise<{
  context: UIContext;
}> => {
  const targetDir = path.join(
    __dirname,
    `../../evaluation/page-data/${pageName}`,
  );
  const context = await buildContext(targetDir);
  return { context };
};
