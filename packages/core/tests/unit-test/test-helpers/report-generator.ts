import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ScreenshotItem } from '@/screenshot-item';
import { ExecutionDump, type ReportMeta } from '@/types';
import sharp from 'sharp';

/** Create a valid-looking image data URL with a predictable payload size. */
export function fakeBase64(
  sizeBytes: number,
  format: 'png' | 'jpeg' | 'webp' = 'png',
): string {
  return `data:image/${format};base64,${'A'.repeat(sizeBytes)}`;
}

export const defaultReportMeta: ReportMeta = {
  groupName: 'test-group',
  groupDescription: 'test',
  sdkVersion: '1.0.0-test',
  modelBriefs: [],
};

let executionCounter = 0;

export function createExecution(
  screenshots: ScreenshotItem[],
  name = 'test-execution',
  id?: string,
): ExecutionDump {
  const tasks = screenshots.map((screenshot, index) => ({
    taskId: `task-${index}`,
    type: 'Insight' as const,
    subType: 'Locate',
    param: { prompt: `task-${index}` },
    uiContext: {
      screenshot,
      shotSize: { width: 1920, height: 1080 },
      shrunkShotToLogicalRatio: 1,
    },
    executor: async () => undefined,
    recorder: [],
    status: 'running' as const,
  }));

  return new ExecutionDump({
    id: id ?? `exec-id-${++executionCounter}`,
    logTime: Date.now(),
    name,
    tasks,
  });
}

export function buildIncrementalExecution(
  existingScreenshots: ScreenshotItem[],
  newScreenshot: ScreenshotItem,
): ExecutionDump {
  existingScreenshots.push(newScreenshot);
  return createExecution([...existingScreenshots]);
}

export function getReportGeneratorTmpDir(prefix: string): string {
  const directory = join(tmpdir(), `midscene-test-${prefix}-${Date.now()}`);
  mkdirSync(directory, { recursive: true });
  return directory;
}

export function parseScriptAttributes(openTag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of openTag.matchAll(/([^\s=]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeURIComponent(match[2]);
  }
  return attributes;
}

export async function decodeImagePixels(image: Buffer) {
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    channels: info.channels,
    pixels: data,
  };
}

export async function createPatternedPngFixture() {
  const width = 2;
  const height = 2;
  const channels = 3;
  const pixels = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const png = await sharp(pixels, {
    raw: { width, height, channels },
  })
    .png()
    .toBuffer();

  return {
    dataUri: `data:image/png;base64,${png.toString('base64')}`,
    expectedImage: { width, height, channels, pixels },
  };
}
