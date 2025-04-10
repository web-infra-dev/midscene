import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { vlLocateMode } from '@/env';
import { describeUserPage } from '@/index';
import { base64Encoded, imageInfoOfBase64 } from '@midscene/shared/img';

export async function buildContext(targetDir: string): Promise<{
  context: {
    size: {
      width: number;
      height: number;
    };
    content: any;
    tree: any;
    screenshotBase64: string;
    originalScreenshotBase64: string;
    describer: () => Promise<any>;
  };
  snapshotJson: string;
  screenshotBase64: string;
  originalScreenshotBase64: string;
}> {
  const originalInputImgP = path.join(
    targetDir,
    existsSync(path.join(targetDir, 'input.png')) ? 'input.png' : 'input.jpeg',
  );
  const originalScreenshotBase64 = base64Encoded(originalInputImgP);

  const resizeOutputImgP = path.join(targetDir, 'output_without_text.png');
  const snapshotJsonPath = path.join(targetDir, 'element-snapshot.json');
  const elementTreeJsonPath = path.join(targetDir, 'element-tree.json');

  if (!existsSync(snapshotJsonPath)) {
    console.warn(
      'element-snapshot.json not found, will use input.png to generate context.',
    );
    const size = await imageInfoOfBase64(originalScreenshotBase64);
    const baseContext = {
      size,
      content: [],
      tree: {
        node: null,
        children: [],
      },
      screenshotBase64: originalScreenshotBase64,
      originalScreenshotBase64,
    };
    const result = {
      context: {
        ...baseContext,
        describer: async () => {
          return describeUserPage(baseContext);
        },
      },
      snapshotJson: '',
      screenshotBase64: originalScreenshotBase64,
      originalScreenshotBase64,
    };
    return result;
  }

  const snapshotJson = readFileSync(snapshotJsonPath, { encoding: 'utf-8' });
  const elementSnapshot = JSON.parse(snapshotJson);
  const elementTree = JSON.parse(
    readFileSync(elementTreeJsonPath, { encoding: 'utf-8' }),
  );
  const screenshotBase64 = vlLocateMode()
    ? originalScreenshotBase64
    : base64Encoded(resizeOutputImgP);

  const size = await imageInfoOfBase64(screenshotBase64);
  const baseContext = {
    size,
    content: elementSnapshot,
    tree: elementTree,
    screenshotBase64,
    originalScreenshotBase64,
  };

  return {
    context: {
      ...baseContext,
      describer: async () => {
        return describeUserPage(baseContext);
      },
    },
    snapshotJson,
    screenshotBase64,
    originalScreenshotBase64,
  };
}

export async function getContextFromFixture(pageName: string) {
  const targetDir = path.join(
    __dirname,
    `../../evaluation/page-data/${pageName}`,
  );
  return await buildContext(targetDir);
}
