import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { z } from 'zod';
import { getMidsceneRunSubDir } from '../common';
import type { UIObservationFrame, UIObservationRecord } from './types';

const observationRecordSchema = z
  .object({
    type: z.literal('midscene_ui_observation'),
    version: z.literal(1),
    frames: z
      .array(
        z
          .object({
            path: z.string().min(1),
            mimeType: z.enum(['image/png', 'image/jpeg']),
            capturedAt: z.number().finite().nonnegative(),
          })
          .strict(),
      )
      .min(1),
    shotSize: z
      .object({
        width: z.number().finite().positive(),
        height: z.number().finite().positive(),
      })
      .strict(),
    shrunkShotToLogicalRatio: z.number().finite().positive(),
  })
  .strict();

export function defaultObservationRecordPath(): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return resolve(
    getMidsceneRunSubDir('output'),
    `observation-${Date.now()}-${suffix}.json`,
  );
}

export function parseUIObservationRecord(input: unknown): UIObservationRecord {
  const result = observationRecordSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const location = issue.path.length > 0 ? issue.path.join('.') : 'record';
    throw new Error(
      `Invalid UI observation record at ${location}: ${issue.message}`,
    );
  }
  return result.data;
}

export function readUIObservationRecord(filePath: string): UIObservationRecord {
  const resolvedPath = resolve(filePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read UI observation record ${resolvedPath}: ${message}`,
    );
  }
  const record = parseUIObservationRecord(parsed);
  const manifestDirectory = dirname(resolvedPath);
  return {
    ...record,
    frames: record.frames.map((frame, index) => {
      if (isAbsolute(frame.path)) {
        throw new Error(
          `Invalid UI observation record at frames.${index}.path: expected a relative image path`,
        );
      }
      const imagePath = resolve(manifestDirectory, frame.path);
      const relativeToManifest = relative(manifestDirectory, imagePath);
      if (
        relativeToManifest === '..' ||
        relativeToManifest.startsWith(
          `..${process.platform === 'win32' ? '\\' : '/'}`,
        ) ||
        isAbsolute(relativeToManifest)
      ) {
        throw new Error(
          `Invalid UI observation record at frames.${index}.path: image path escapes the manifest directory`,
        );
      }
      try {
        if (!statSync(imagePath).isFile()) {
          throw new Error('path is not a file');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Invalid UI observation record at frames.${index}.path: cannot read image ${imagePath}: ${message}`,
        );
      }
      return { ...frame, path: imagePath };
    }),
  };
}

export interface UIObservationRecordMetadata {
  shotSize: UIObservationRecord['shotSize'];
  shrunkShotToLogicalRatio: number;
}

/**
 * Incrementally persists observation frames, then writes a portable JSON
 * manifest whose paths point into an adjacent image directory.
 */
export class UIObservationRecordWriter {
  readonly outputPath: string;
  readonly framesDirectory: string;
  private readonly temporaryFramesDirectory: string;
  private finalized = false;

  constructor(filePath?: string) {
    this.outputPath = filePath
      ? resolve(filePath)
      : defaultObservationRecordPath();
    const extension = extname(this.outputPath);
    const stem = basename(this.outputPath, extension);
    this.framesDirectory = join(dirname(this.outputPath), `${stem}.frames`);
    this.temporaryFramesDirectory = `${this.framesDirectory}.tmp-${process.pid}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  persistFrame(dataUrl: string, capturedAt: number): UIObservationFrame {
    if (this.finalized) {
      throw new Error('UI observation record has already been finalized');
    }
    const match = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i.exec(dataUrl);
    if (!match) {
      throw new Error('UI observation frame must be a PNG or JPEG data URL');
    }
    const format = match[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
    const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0) {
      throw new Error('UI observation frame contains no image data');
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    const fileName = `${digest}.${format}`;
    mkdirSync(this.temporaryFramesDirectory, { recursive: true });
    const temporaryPath = join(this.temporaryFramesDirectory, fileName);
    if (!existsSync(temporaryPath)) {
      writeFileSync(temporaryPath, bytes);
    }
    return {
      path: `${basename(this.framesDirectory)}/${fileName}`,
      mimeType,
      capturedAt,
    };
  }

  /** Resolve a persisted frame before or after the writer is finalized. */
  resolveFramePath(frame: UIObservationFrame): string {
    const directory = this.finalized
      ? this.framesDirectory
      : this.temporaryFramesDirectory;
    return join(directory, basename(frame.path));
  }

  finalize(
    frames: UIObservationFrame[],
    metadata: UIObservationRecordMetadata,
  ): string {
    if (this.finalized) return this.outputPath;
    const record = parseUIObservationRecord({
      type: 'midscene_ui_observation',
      version: 1,
      frames,
      ...metadata,
    });
    mkdirSync(dirname(this.outputPath), { recursive: true });
    mkdirSync(this.temporaryFramesDirectory, { recursive: true });
    rmSync(this.framesDirectory, { recursive: true, force: true });
    renameSync(this.temporaryFramesDirectory, this.framesDirectory);
    const temporaryManifest = `${this.outputPath}.tmp-${process.pid}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    writeFileSync(temporaryManifest, JSON.stringify(record, null, 2), 'utf8');
    renameSync(temporaryManifest, this.outputPath);
    this.finalized = true;
    return this.outputPath;
  }
}
