import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { generateImageScriptTag, parseImageScripts } from './html-utils';
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
      if (ref && !this.locations.has(ref.id)) refs.set(ref.id, ref);
      return value;
    });
    return [...refs.values()];
  }

  rewriteSync(serialized: string, sourcePath: string): string {
    let inlineImages: Record<string, string> | undefined;
    for (const ref of this.collect(serialized)) {
      let data: string;
      if (ref.storage === 'file')
        data = `data:${ref.mimeType};base64,${readFileSync(resolve(dirname(sourcePath), ref.path!)).toString('base64')}`;
      else {
        inlineImages ??= parseImageScripts(readFileSync(sourcePath, 'utf8'));
        data = inlineImages[ref.id];
        if (!data)
          throw new Error(`Missing report image ${ref.id} in ${sourcePath}`);
      }
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
    return this.rewrite(serialized);
  }

  async rewriteAsync(serialized: string, sourcePath: string): Promise<string> {
    let inlineImages: Record<string, string> | undefined;
    for (const ref of this.collect(serialized)) {
      let data: string;
      if (ref.storage === 'file') {
        const bytes = await fs.readFile(
          resolve(dirname(sourcePath), ref.path!),
        );
        data = `data:${ref.mimeType};base64,${bytes.toString('base64')}`;
      } else {
        inlineImages ??= parseImageScripts(
          await fs.readFile(sourcePath, 'utf8'),
        );
        data = inlineImages[ref.id];
        if (!data)
          throw new Error(`Missing report image ${ref.id} in ${sourcePath}`);
      }
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
    return this.rewrite(serialized);
  }
}
