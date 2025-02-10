import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describeUserPage } from '@/ai-model';
import { base64Encoded, imageInfoOfBase64 } from '@/image';

export async function getPageContext(targetDir: string): Promise<{
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
  // Note: this is the magic
  const resizeOutputImgP = path.join(targetDir, 'output_without_text.png');
  const originalInputImgP = path.join(targetDir, 'input.png');
  const snapshotJsonPath = path.join(targetDir, 'element-snapshot.json');
  const elementTreeJsonPath = path.join(targetDir, 'element-tree.json');
  const snapshotJson = readFileSync(snapshotJsonPath, { encoding: 'utf-8' });
  const elementSnapshot = JSON.parse(snapshotJson);
  const elementTree = JSON.parse(
    readFileSync(elementTreeJsonPath, { encoding: 'utf-8' }),
  );
  const screenshotBase64 = base64Encoded(resizeOutputImgP);
  const originalScreenshotBase64 = base64Encoded(originalInputImgP);
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

export async function getPageData(pageName: string) {
  const targetDir = path.join(__dirname, `../page-cases/inspect/${pageName}`);
  return await getPageContext(targetDir);
}
