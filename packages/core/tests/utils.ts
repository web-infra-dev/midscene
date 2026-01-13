import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { callAIWithObjectResponse } from '@/ai-model/service-caller/index';
import { localImg2Base64 } from '@/image';
import { ScreenshotItem } from '@/screenshot-item';
import Service from '@/service';
import type { AIElementResponse, UIContext } from '@/types';

export function getFixture(name: string) {
  return join(__dirname, 'fixtures', name);
}

export function getDemoFilePath(name: string) {
  return join(__dirname, `../demo_data/${name}`);
}

export function updateAppDemoData(
  fileName: string,
  data: Record<string, unknown>,
) {
  const demoPath = getDemoFilePath(fileName);
  writeFileSync(demoPath, JSON.stringify(data, null, 2));
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fakeService(content: string) {
  const screenshotPath = getFixture('baidu.png');
  const screenshotBase64 = localImg2Base64(screenshotPath);
  const screenshot = await ScreenshotItem.create(screenshotBase64);
  const basicContext = {
    screenshot,
    size: { width: 1920, height: 1080 },
  };
  const context: UIContext = {
    ...basicContext,
  };

  const aiVendor: typeof callAIWithObjectResponse<AIElementResponse> =
    async () => {
      const data = {
        bbox: [0, 0, 100, 100] as [number, number, number, number],
        errors: [],
      };
      return {
        content: data,
        contentString: JSON.stringify(data),
        usage: undefined,
      };
    };

  const service = new Service(context, {
    aiVendorFn: aiVendor as any,
  });

  return service;
}
