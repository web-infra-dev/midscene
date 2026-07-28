import { Buffer } from 'node:buffer';
import {
  type BrowserWebpEncodeInput,
  encodeRgbaToWebp,
} from '@midscene/shared/img';
import { type Page, expect, test } from '@playwright/test';

type BrowserWebpEncoder = (
  input: BrowserWebpEncodeInput,
) => Promise<Uint8Array>;

function createRgbaFixture(width: number, height: number): number[] {
  const pixels = new Array<number>(width * height * 4);
  let randomState = 0x1234abcd;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      randomState = (randomState * 1664525 + 1013904223) >>> 0;
      const offset = (y * width + x) * 4;
      const noise = randomState & 0xff;
      pixels[offset] = (x * 11 + y * 3 + noise) & 0xff;
      pixels[offset + 1] = (x * 5 + y * 17 + (noise >> 1)) & 0xff;
      pixels[offset + 2] = (x * 19 + y * 7 + (noise >> 2)) & 0xff;
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

function expectWebpSignature(bytes: number[]): void {
  const buffer = Buffer.from(bytes);
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(buffer.subarray(8, 12).toString('ascii')).toBe('WEBP');
}

async function decodeDimensions(
  page: Page,
  bytes: number[],
): Promise<{ width: number; height: number }> {
  return page.evaluate(async (encodedBytes) => {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(encodedBytes)], { type: 'image/webp' }),
    );
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }, bytes);
}

test.describe('browser WebP encoder', () => {
  const width = 128;
  const height = 96;
  const pixels = createRgbaFixture(width, height);
  const encoderSource = encodeRgbaToWebp.toString();

  test.beforeEach(async ({ page }) => {
    await page.goto('data:text/html,<title>browser WebP encoder</title>');
    await page.addScriptTag({
      content: `globalThis.__midsceneEncodeRgbaToWebp = ${encoderSource};`,
    });
  });

  test('uses HTML Canvas quality on the browser main thread', async ({
    page,
  }) => {
    await page.evaluate(() => {
      Object.defineProperty(globalThis, 'OffscreenCanvas', {
        configurable: true,
        value: undefined,
      });
    });

    const [quality10, quality90] = await page.evaluate(
      async ({ fixturePixels, fixtureWidth, fixtureHeight }) => {
        const encode = (
          globalThis as typeof globalThis & {
            __midsceneEncodeRgbaToWebp: BrowserWebpEncoder;
          }
        ).__midsceneEncodeRgbaToWebp;
        const lowQuality = await encode({
          pixels: fixturePixels,
          width: fixtureWidth,
          height: fixtureHeight,
          quality: 10,
        });
        const highQuality = await encode({
          pixels: fixturePixels,
          width: fixtureWidth,
          height: fixtureHeight,
          quality: 90,
        });
        return [Array.from(lowQuality), Array.from(highQuality)];
      },
      {
        fixturePixels: pixels,
        fixtureWidth: width,
        fixtureHeight: height,
      },
    );

    expectWebpSignature(quality10);
    expectWebpSignature(quality90);
    expect(quality10).not.toEqual(quality90);
    expect(quality10.length).toBeLessThan(quality90.length);
    await expect(decodeDimensions(page, quality90)).resolves.toEqual({
      width,
      height,
    });
  });

  test('encodes WebP with OffscreenCanvas inside a Worker', async ({
    page,
  }) => {
    const workerBytes = await page.evaluate(
      async ({
        productionEncoderSource,
        fixturePixels,
        fixtureWidth,
        fixtureHeight,
      }) => {
        const workerSource = `
          const encodeRgbaToWebp = ${productionEncoderSource};
          self.onmessage = async (event) => {
            try {
              const output = await encodeRgbaToWebp(event.data);
              self.postMessage({ bytes: Array.from(output) });
            } catch (error) {
              self.postMessage({
                error: error instanceof Error ? error.message : String(error),
              });
            }
          };
        `;
        const workerUrl = URL.createObjectURL(
          new Blob([workerSource], { type: 'text/javascript' }),
        );
        const worker = new Worker(workerUrl);

        try {
          return await new Promise<number[]>((resolve, reject) => {
            worker.onmessage = (
              event: MessageEvent<{ bytes?: number[]; error?: string }>,
            ) => {
              if (event.data.error) {
                reject(new Error(event.data.error));
                return;
              }
              if (!event.data.bytes) {
                reject(new Error('Worker returned no WebP bytes'));
                return;
              }
              resolve(event.data.bytes);
            };
            worker.onerror = (event) => reject(new Error(event.message));
            worker.postMessage({
              pixels: fixturePixels,
              width: fixtureWidth,
              height: fixtureHeight,
              quality: 90,
            });
          });
        } finally {
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        }
      },
      {
        productionEncoderSource: encoderSource,
        fixturePixels: pixels,
        fixtureWidth: width,
        fixtureHeight: height,
      },
    );

    expectWebpSignature(workerBytes);
    await expect(decodeDimensions(page, workerBytes)).resolves.toEqual({
      width,
      height,
    });
  });
});
