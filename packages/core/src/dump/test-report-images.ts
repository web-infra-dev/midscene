import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { assertReportArtifactPath } from '@midscene/shared/report-artifact';
import {
  generateImageScriptTag,
  streamInlineReportImages,
  streamInlineReportImagesAsync,
} from './html-utils';
import {
  type StoredImageRef,
  imageRefFileExtension,
  normalizeStoredImageRef,
} from './image-reference';
import {
  parseBase64ImageDataUrl,
  reportImageFileName,
} from './screenshot-store';

/** Final delivery format is independent of how Agents stored their source records. */
export class TestReportImages {
  private readonly locations = new Map<
    string,
    Pick<StoredImageRef, 'storage' | 'path'>
  >();
  private readonly files = new Set<string>();

  constructor(
    private readonly reportPath: string,
    private readonly external: boolean,
  ) {}

  private reference(ref: StoredImageRef, dataUri: string): StoredImageRef {
    const known = this.locations.get(ref.id);
    if (known) return { ...ref, ...known };
    const location: Pick<StoredImageRef, 'storage' | 'path'> = this.external
      ? {
          storage: 'file',
          path: `./screenshots/${reportImageFileName(imageRefFileExtension(ref), Buffer.from(parseBase64ImageDataUrl(dataUri).rawBase64, 'base64'))}`,
        }
      : { storage: 'inline', path: undefined };
    this.locations.set(ref.id, location);
    return { ...ref, ...location };
  }

  private rewrite(serialized: string): string {
    return JSON.stringify(JSON.parse(serialized), (_key, value) => {
      const ref = normalizeStoredImageRef(value);
      return ref ? { ...ref, ...this.locations.get(ref.id) } : value;
    });
  }

  private collect(serialized: string): StoredImageRef[] {
    const refs = new Map<string, StoredImageRef>();
    JSON.parse(serialized, (_key, value) => {
      const ref = normalizeStoredImageRef(value);
      if (ref?.storage === 'file') assertReportArtifactPath(ref.path);
      if (ref && !this.locations.has(ref.id)) refs.set(ref.id, ref);
      return value;
    });
    return [...refs.values()];
  }

  private inlineSources(
    refs: StoredImageRef[],
    sourcePath: string,
    origins?: ReadonlyMap<string, string>,
  ): Map<string, Map<string, StoredImageRef>> {
    const sources = new Map<string, Map<string, StoredImageRef>>();
    for (const ref of refs)
      if (ref.storage === 'inline') {
        const source = origins?.get(ref.id) ?? sourcePath;
        const images = sources.get(source) ?? new Map<string, StoredImageRef>();
        images.set(ref.id, ref);
        sources.set(source, images);
      }
    return sources;
  }

  private writeSync(ref: StoredImageRef, data: string): void {
    const target = this.reference(ref, data);
    if (target.storage === 'file') {
      if (!this.files.has(target.path!)) {
        const file = join(dirname(this.reportPath), target.path!);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(
          file,
          Buffer.from(parseBase64ImageDataUrl(data).rawBase64, 'base64'),
        );
        this.files.add(target.path!);
      }
    } else
      appendFileSync(
        this.reportPath,
        `${generateImageScriptTag(ref.id, data)}\n`,
      );
  }

  private async write(ref: StoredImageRef, data: string): Promise<void> {
    const target = this.reference(ref, data);
    if (target.storage === 'file') {
      if (!this.files.has(target.path!)) {
        const file = join(dirname(this.reportPath), target.path!);
        await fs.mkdir(dirname(file), { recursive: true });
        await fs.writeFile(
          file,
          Buffer.from(parseBase64ImageDataUrl(data).rawBase64, 'base64'),
        );
        this.files.add(target.path!);
      }
    } else
      await fs.appendFile(
        this.reportPath,
        `${generateImageScriptTag(ref.id, data)}\n`,
      );
  }

  rewriteSync(
    serialized: string,
    sourcePath: string,
    origins?: ReadonlyMap<string, string>,
  ): string {
    const refs = this.collect(serialized);
    for (const ref of refs)
      if (ref.storage === 'file') {
        const bytes = readFileSync(
          resolve(dirname(origins?.get(ref.id) ?? sourcePath), ref.path!),
        );
        this.writeSync(
          ref,
          `data:${ref.mimeType};base64,${bytes.toString('base64')}`,
        );
      }
    for (const [source, images] of this.inlineSources(
      refs,
      sourcePath,
      origins,
    )) {
      streamInlineReportImages(source, (id, data) => {
        const ref = images.get(id);
        if (ref) {
          this.writeSync(ref, data);
          images.delete(id);
        }
        return images.size === 0;
      });
      if (images.size)
        throw new Error(
          `Missing report image ${images.keys().next().value} in ${source}`,
        );
    }
    return this.rewrite(serialized);
  }

  async rewriteAsync(
    serialized: string,
    sourcePath: string,
    origins?: ReadonlyMap<string, string>,
  ): Promise<string> {
    const refs = this.collect(serialized);
    for (const ref of refs)
      if (ref.storage === 'file') {
        const bytes = await fs.readFile(
          resolve(dirname(origins?.get(ref.id) ?? sourcePath), ref.path!),
        );
        await this.write(
          ref,
          `data:${ref.mimeType};base64,${bytes.toString('base64')}`,
        );
      }
    for (const [source, images] of this.inlineSources(
      refs,
      sourcePath,
      origins,
    )) {
      for await (const { id, data } of streamInlineReportImagesAsync(source)) {
        const ref = images.get(id);
        if (ref) {
          await this.write(ref, data);
          images.delete(id);
        }
        if (!images.size) break;
      }
      if (images.size)
        throw new Error(
          `Missing report image ${images.keys().next().value} in ${source}`,
        );
    }
    return this.rewrite(serialized);
  }
}
