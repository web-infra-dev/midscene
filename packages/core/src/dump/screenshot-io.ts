import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GroupedActionDump } from '../types';

/**
 * Write all screenshots from a dump to separate PNG files.
 * Creates a screenshots directory and a JSON map file.
 *
 * @param dump - The GroupedActionDump containing screenshots
 * @param basePath - Base path for the dump file (screenshots will be in `${basePath}.screenshots/`)
 * @returns Record mapping screenshot IDs to file paths
 */
export function writeScreenshotsToFiles(
  dump: GroupedActionDump,
  basePath: string,
): Record<string, string> {
  const screenshotsDir = `${basePath}.screenshots`;
  if (!existsSync(screenshotsDir)) {
    mkdirSync(screenshotsDir, { recursive: true });
  }

  const screenshotMap: Record<string, string> = {};
  const screenshots = dump.collectAllScreenshots();

  for (const screenshot of screenshots) {
    if (screenshot.hasBase64()) {
      const imagePath = join(screenshotsDir, `${screenshot.id}.png`);
      const rawBase64 = screenshot.rawBase64;
      writeFileSync(imagePath, Buffer.from(rawBase64, 'base64'));
      screenshotMap[screenshot.id] = imagePath;
    }
  }

  // Write screenshot map file
  writeFileSync(
    `${basePath}.screenshots.json`,
    JSON.stringify(screenshotMap),
    'utf-8',
  );

  return screenshotMap;
}

/**
 * Build an imageMap from screenshot files for use with restoreImageReferences.
 * Reads PNG files and converts them to base64 data URIs.
 *
 * @param screenshotMap - Record mapping screenshot IDs to file paths
 * @returns Record mapping screenshot IDs to base64 data URIs
 */
export function buildImageMapFromFiles(
  screenshotMap: Record<string, string>,
): Record<string, string> {
  const imageMap: Record<string, string> = {};

  for (const [id, filePath] of Object.entries(screenshotMap)) {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath);
      imageMap[id] = `data:image/png;base64,${data.toString('base64')}`;
    }
  }

  return imageMap;
}
