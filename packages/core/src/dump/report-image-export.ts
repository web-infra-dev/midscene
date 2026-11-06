import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type StoredImageRef, imageRefFileExtension } from './image-reference';
import {
  parseBase64ImageDataUrl,
  reportImageFileName,
  resolveImageSource,
} from './screenshot-store';

/** Export image bytes once while keeping every observation's own metadata. */
export class ReportImageExporter {
  private readonly locations = new Map<string, string>();
  private readonly writtenFiles = new Set<string>();

  constructor(
    private readonly reportPath: string,
    private readonly screenshotsDir: string,
  ) {}

  write(ref: StoredImageRef, dataUri?: string): string {
    const key = JSON.stringify([ref.id, ref.mimeType, ref.storage, ref.path]);
    const known = this.locations.get(key);
    if (known) return known;
    const source = dataUri
      ? { type: 'data-uri' as const, dataUri }
      : resolveImageSource(ref, { reportPath: this.reportPath });
    const bytes =
      source.type === 'file'
        ? readFileSync(source.filePath)
        : Buffer.from(
            parseBase64ImageDataUrl(source.dataUri).rawBase64,
            'base64',
          );
    const name = reportImageFileName(imageRefFileExtension(ref), bytes);
    if (!this.writtenFiles.has(name)) {
      writeFileSync(join(this.screenshotsDir, name), bytes);
      this.writtenFiles.add(name);
    }
    this.locations.set(key, name);
    return name;
  }

  get files(): string[] {
    return [...this.writtenFiles]
      .sort()
      .map((name) => join(this.screenshotsDir, name));
  }
}
