import { readFileSync } from 'node:fs';
import {
  normalizeStoredImageRef,
  resolveImageSource,
} from '@midscene/core/dump';

/** Collect every image asset referenced by a serialized report fixture. */
export function collectStoredReportImages(
  value: unknown,
  options: {
    reportPath: string;
    inlineImages: Readonly<Record<string, string>>;
  },
): Record<string, string> {
  const images: Record<string, string> = {};

  const visit = (currentValue: unknown): void => {
    const ref = normalizeStoredImageRef(currentValue);
    if (ref) {
      if (images[ref.id] !== undefined) return;

      const inlineImage = options.inlineImages[ref.id];
      if (inlineImage !== undefined) {
        images[ref.id] = inlineImage;
        return;
      }

      const source = resolveImageSource(ref, {
        reportPath: options.reportPath,
      });
      if (source.type === 'data-uri') {
        images[ref.id] = source.dataUri;
        return;
      }

      const base64 = readFileSync(source.filePath).toString('base64');
      images[ref.id] = `data:${source.mimeType};base64,${base64}`;
      return;
    }

    if (Array.isArray(currentValue)) {
      for (const item of currentValue) visit(item);
      return;
    }

    if (typeof currentValue === 'object' && currentValue !== null) {
      for (const item of Object.values(currentValue)) visit(item);
    }
  };

  visit(value);
  return images;
}
