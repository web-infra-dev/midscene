import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ScreenshotItem } from '@/screenshot-item';
import { ExecutionDump, type ReportMeta } from '@/types';
import sharp from 'sharp';
import { testPng } from './image';

/** Create a valid-looking image data URL with a predictable payload size. */
export function fakeBase64(
  sizeBytes: number,
  format: 'png' | 'jpeg' | 'webp' = 'png',
): string {
  if (format === 'png') return testPng(100, 100, 'A'.repeat(sizeBytes));
  if (format === 'jpeg') {
    const image = Buffer.from(
      '/9j/4AAQSkZJRgABAgEASABIAAD/4QDKRXhpZgAATU0AKgAAAAgABgESAAMAAAABAAEAAAEaAAUAAAABAAAAVgEbAAUAAAABAAAAXgEoAAMAAAABAAIAAAITAAMAAAABAAEAAIdpAAQAAAABAAAAZgAAAAAAAABIAAAAAQAAAEgAAAABAAeQAAAHAAAABDAyMjGRAQAHAAAABAECAwCgAAAHAAAABDAxMDCgAQADAAAAAQABAACgAgAEAAAAAQAAAAKgAwAEAAAAAQAAAAKkBgADAAAAAQAAAAAAAAAAAAD/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwABAQEBAQECAQECAwICAgMEAwMDAwQFBAQEBAQFBgUFBQUFBQYGBgYGBgYGBwcHBwcHCAgICAgJCQkJCQkJCQkJ/9sAQwEBAQECAgIEAgIECQYFBgkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJ/90ABAAB/9oADAMBAAIRAxEAPwD+/iiiigD/2Q==',
      'base64',
    );
    const chunks = [image.subarray(0, 2)];
    for (let remaining = sizeBytes; remaining > 0; remaining -= 65533) {
      const body = Buffer.alloc(Math.min(remaining, 65533), 65);
      const header = Buffer.from([0xff, 0xfe, 0, 0]);
      header.writeUInt16BE(body.length + 2, 2);
      chunks.push(header, body);
    }
    chunks.push(image.subarray(2));
    return `data:image/jpeg;base64,${Buffer.concat(chunks).toString('base64')}`;
  }
  const signature = {
    png: 'iVBORw0KGgoAAAAA',
    jpeg: '/9j/4AAQSkZJRgAB',
    webp: 'UklGRgAAAABXRUJQ',
  }[format];
  const body = `${signature}${'A'.repeat(Math.max(0, sizeBytes - signature.length))}`;
  return `data:image/${format};base64,${body}`;
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
