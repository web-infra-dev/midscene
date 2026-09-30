import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { MidsceneResultsFileData } from '../midscene/types.js';

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Embed the original screenshot bytes without changing dimensions or GT coordinates. */
export async function embedReportImages(
  results: MidsceneResultsFileData,
  reportDirectory: string,
): Promise<MidsceneResultsFileData> {
  const images = new Map<string, Promise<string>>();
  const loadImage = (source: string): Promise<string> => {
    if (source.startsWith('data:image/')) return Promise.resolve(source);
    if (/^[a-z][a-z\d+.-]*:/i.test(source)) {
      throw new Error(
        `Standalone reports require local screenshots: ${source}`,
      );
    }
    const absolutePath = path.resolve(reportDirectory, source);
    const existing = images.get(absolutePath);
    if (existing) return existing;
    const mimeType = IMAGE_MIME_TYPES[path.extname(absolutePath).toLowerCase()];
    if (!mimeType) throw new Error(`Unsupported screenshot format: ${source}`);
    const embedded = readFile(absolutePath).then(
      (bytes) => `data:${mimeType};base64,${bytes.toString('base64')}`,
    );
    images.set(absolutePath, embedded);
    return embedded;
  };

  return {
    ...results,
    cases: await Promise.all(
      results.cases.map(async (record) => ({
        ...record,
        images: await Promise.all(
          record.images.map(async (image) => ({
            ...image,
            imageRelativePath: await loadImage(image.imageRelativePath),
          })),
        ),
      })),
    ),
  };
}
