/* eslint-disable @typescript-eslint/no-magic-numbers */
import path, { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { base64Encoded, imageInfoOfBase64, transformImgPathToBase64 } from '@/image';
import { vi } from 'vitest';
import { BaseElement, UIContext } from '@/types';
import Insight from '@/insight';

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

// export async function launch(url: string, opt?: {
//   viewport?: Viewport,
// }) {
//   const browser = await puppeteer.launch();

//   const page = (await browser.pages())[0];
//   const viewportConfig = {
//     width: opt?.viewport?.pixelWidth || 1920,
//     height: opt?.viewport?.pixelHeight || 1080,
//     deviceScaleFactor: opt?.viewport?.dpr || 1,
//   }
//   await page.setViewport(viewportConfig);
//   await Promise.all([
//     page.waitForNavigation({
//       timeout: 20 * 1000,
//       waitUntil: 'networkidle0',
//     }),
//     (async () => {
//       const response = await page.goto(url);
//       if (response?.status) {
//         assert(response.status() <= 399, `Page load failed: ${response.status()}`);
//       }
//     })(),
//   ]);
//   await sleep(2 * 1000);

//   return browser;
// }

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

  const insight = new Insight(
    context,
    {
      aiVendorFn: aiVendor as any,
    },
  );

  return insight;
}


export function generateUIContext(testDataPath: string) {
  return async ()=> {
    const screenshotBase64 = await transformImgPathToBase64(path.join(testDataPath, 'input.png'));
    const size = await imageInfoOfBase64(screenshotBase64);

    const captureElementSnapshot = readFileSync(path.join(testDataPath, 'element-snapshot.json'), 'utf-8');

    // align element
    const elementsInfo = JSON.parse(captureElementSnapshot) as BaseElement[];

    const baseContext = {
      size,
      content: elementsInfo,
      screenshotBase64: `data:image/png;base64,${screenshotBase64}`,
    };

    return {
      ...baseContext,
    }
  };
}
