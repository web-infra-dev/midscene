import { readFileSync, writeFileSync } from 'node:fs';
/* eslint-disable @typescript-eslint/no-magic-numbers */
import path, { join } from 'node:path';
import {
  base64Encoded,
  imageInfoOfBase64,
  transformImgPathToBase64,
} from '@/image';
import Insight from '@/insight';
import type { BaseElement, UIContext } from '@/types';
import { vi } from 'vitest';

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

export function fakeInsight(content: string) {
  const screenshot = getFixture('baidu.png');
  const basicContext = {
    screenshotBase64: base64Encoded(screenshot),
    size: { width: 1920, height: 1080 },
    content: [
      {
        id: '0',
        content,
        rect: {
          width: 100,
          height: 100,
          top: 200,
          left: 200,
        },
        center: [250, 250],
        tap: vi.fn() as unknown,
      },
      // describer: basicPa
    ] as unknown as BaseElement[],
  };
  const context: UIContext = {
    ...basicContext,
  };

  const aiVendor = () => ({
    elements: [{ id: '0' }],
    errors: [],
  });

  const insight = new Insight(context, {
    aiVendorFn: aiVendor as any,
  });

  return insight;
}

export function generateUIContext(testDataPath: string) {
  return async () => {
    const screenshotBase64 = await transformImgPathToBase64(
      path.join(testDataPath, 'input.png'),
    );
    const size = await imageInfoOfBase64(screenshotBase64);

    const captureElementSnapshot = readFileSync(
      path.join(testDataPath, 'element-snapshot.json'),
      'utf-8',
    );

    // align element
    const elementsInfo = JSON.parse(captureElementSnapshot) as BaseElement[];

    const baseContext = {
      size: { width: size.width, height: size.height },
      content: elementsInfo,
      screenshotBase64: `data:image/png;base64,${screenshotBase64}`,
    };

    return {
      ...baseContext,
    };
  };
}
