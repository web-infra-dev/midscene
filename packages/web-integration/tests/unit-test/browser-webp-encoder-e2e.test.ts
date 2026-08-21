import { Buffer } from 'node:buffer';
import {
  type BrowserWebpEncodeInput,
  encodeRgbaToWebp,
  encodedImageInfoOfBuffer,
  isValidWebPImageBuffer,
} from '@midscene/shared/img';
import { type Browser, type Page, chromium } from 'playwright';
import puppeteer from 'puppeteer';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

type BrowserWebpEncoder = (
  input: BrowserWebpEncodeInput,
) => Promise<Uint8Array>;

const TEST_TIMEOUT_MS = 120_000;
const width = 64;
const height = 48;
const pixels = Array.from({ length: width * height * 4 }, (_, index) =>
  index % 4 === 3 ? 255 : (index * 37) % 256,
);
const encoderSource = encodeRgbaToWebp.toString();

function expectValidWebp(bytes: number[]): void {
  const buffer = Buffer.from(bytes);
  expect(isValidWebPImageBuffer(buffer)).toBe(true);
  expect(encodedImageInfoOfBuffer(buffer)).toEqual({ width, height });
}

async function decodeDimensions(
  page: Page,
  bytes: number[],
): Promise<{ width: number; height: number }> {
  return page.evaluate(async (encodedBytes) => {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(encodedBytes)], { type: 'image/webp' }),
    );
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }, bytes);
}

describe('browser WebP encoder in Chromium', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      executablePath: puppeteer.executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.goto('data:text/html,<title>browser WebP encoder</title>');
    await page.addScriptTag({
      content: `globalThis.__midsceneEncodeRgbaToWebp = ${encoderSource};`,
    });
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    await browser?.close();
  }, TEST_TIMEOUT_MS);

  test('encodes through HTMLCanvasElement on the main thread', async () => {
    const bytes = await page.evaluate(
      async ({ fixturePixels, fixtureWidth, fixtureHeight }) => {
        Object.defineProperty(globalThis, 'OffscreenCanvas', {
          configurable: true,
          value: undefined,
        });
        const encode = (
          globalThis as typeof globalThis & {
            __midsceneEncodeRgbaToWebp: BrowserWebpEncoder;
          }
        ).__midsceneEncodeRgbaToWebp;
        return Array.from(
          await encode({
            pixels: fixturePixels,
            width: fixtureWidth,
            height: fixtureHeight,
            quality: 90,
          }),
        );
      },
      {
        fixturePixels: pixels,
        fixtureWidth: width,
        fixtureHeight: height,
      },
    );

    expectValidWebp(bytes);
    await expect(decodeDimensions(page, bytes)).resolves.toEqual({
      width,
      height,
    });
  });

  test('encodes through OffscreenCanvas in a Worker', async () => {
    const bytes = await page.evaluate(
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
              } else if (event.data.bytes) {
                resolve(event.data.bytes);
              } else {
                reject(new Error('Worker returned no WebP bytes'));
              }
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

    expectValidWebp(bytes);
    await expect(decodeDimensions(page, bytes)).resolves.toEqual({
      width,
      height,
    });
  });
});
