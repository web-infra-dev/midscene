import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { localImg2Base64 } from '@midscene/shared/img';

export function getFixture(name: string) {
  return join(__dirname, 'fixtures', name);
}

export function getDemoFilePath(name: string) {
  return join(__dirname, `../demo_data/${name}`);
}

export function updateAppDemoData(fileName: string, data: object) {
  const demoPath = getDemoFilePath(fileName);
  writeFileSync(demoPath, JSON.stringify(data, null, 2));
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a fake UIContext for testing purposes
 * @param content - optional identifier for the context (not used currently)
 * @returns UIContext with screenshot and basic properties
 */
export function createFakeContext(content?: string): UIContext {
  const screenshotPath = getFixture('baidu.png');
  const screenshotBase64 = localImg2Base64(screenshotPath);
  const screenshot = ScreenshotItem.create(screenshotBase64);

  return {
    screenshot,
    size: { width: 1920, height: 1080 },
  };
}
