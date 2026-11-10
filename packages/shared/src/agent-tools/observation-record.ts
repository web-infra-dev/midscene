import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
    startedAt: z.number().finite().nonnegative(),
    endedAt: z.number().finite().nonnegative(),
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
  .strict()
  .refine((record) => record.endedAt >= record.startedAt, {
    path: ['endedAt'],
    message: 'must be greater than or equal to startedAt',
  });

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

/** Return a detached record so callers cannot mutate runtime-owned state. */
export function cloneUIObservationRecord(
  record: UIObservationRecord,
): UIObservationRecord {
  return {
    ...record,
    frames: record.frames.map((frame) => ({ ...frame })),
    shotSize: { ...record.shotSize },
  };
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
  startedAt: number;
  endedAt: number;
  shotSize: UIObservationRecord['shotSize'];
  shrunkShotToLogicalRatio: number;
}

/**
 * Incrementally persists observation frames and exports a runtime record whose
 * paths resolve to those image files.
 */
export class UIObservationRecordWriter {
  readonly outputPath: string;
  readonly framesDirectory: string;
  private readonly temporaryFramesDirectory: string;
  private finalized = false;
  private disposed = false;
  private finalizedRecord: UIObservationRecord | null = null;

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
    if (this.disposed) {
      throw new Error('UI observation record writer has been disposed');
    }
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
    if (this.disposed) {
      throw new Error('UI observation record writer has been disposed');
    }
    const directory = this.finalized
      ? this.framesDirectory
      : this.temporaryFramesDirectory;
    return join(directory, basename(frame.path));
  }

  /** Remove persisted images that are no longer referenced by the frame buffer. */
  pruneFrames(frames: UIObservationFrame[]): void {
    if (this.disposed) {
      throw new Error('UI observation record writer has been disposed');
    }
    if (this.finalized || !existsSync(this.temporaryFramesDirectory)) return;

    const retainedFiles = new Set(frames.map((frame) => basename(frame.path)));
    for (const fileName of readdirSync(this.temporaryFramesDirectory)) {
      if (!retainedFiles.has(fileName)) {
        rmSync(join(this.temporaryFramesDirectory, fileName), { force: true });
      }
    }
  }

  finalize(
    frames: UIObservationFrame[],
    metadata: UIObservationRecordMetadata,
  ): UIObservationRecord {
    if (this.disposed) {
      throw new Error('UI observation record writer has been disposed');
    }
    if (this.finalizedRecord) return this.finalizedRecord;
    const record = parseUIObservationRecord({
      type: 'midscene_ui_observation',
      version: 1,
      frames,
      ...metadata,
    });
    this.pruneFrames(record.frames);
    mkdirSync(dirname(this.outputPath), { recursive: true });
    mkdirSync(this.temporaryFramesDirectory, { recursive: true });
    rmSync(this.framesDirectory, { recursive: true, force: true });
    renameSync(this.temporaryFramesDirectory, this.framesDirectory);
    this.finalized = true;
    this.finalizedRecord = {
      ...record,
      frames: record.frames.map((frame) => ({
        ...frame,
        path: resolve(dirname(this.outputPath), frame.path),
      })),
    };
    return this.finalizedRecord;
  }

  /** Delete writer-owned temporary or finalized frame files. */
  dispose(): void {
    if (this.disposed) return;
    rmSync(this.temporaryFramesDirectory, { recursive: true, force: true });
    rmSync(this.framesDirectory, { recursive: true, force: true });
    this.disposed = true;
    this.finalizedRecord = null;
  }
}

/**
 * Persist a resolved observation record as a portable JSON manifest plus an
 * adjacent image directory. The input record remains usable after writing.
 */
export function writeUIObservationRecord(
  record: UIObservationRecord,
  filePath?: string,
): string {
  const validated = parseUIObservationRecord(record);
  const outputPath = filePath
    ? resolve(filePath)
    : defaultObservationRecordPath();
  const extension = extname(outputPath);
  const stem = basename(outputPath, extension);
  const framesDirectory = join(dirname(outputPath), `${stem}.frames`);
  const temporaryFramesDirectory = `${framesDirectory}.tmp-${process.pid}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const temporaryManifest = `${outputPath}.tmp-${process.pid}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const copiedPaths = new Map<string, string>();

  try {
    mkdirSync(temporaryFramesDirectory, { recursive: true });
    const frames = validated.frames.map((frame, index) => {
      const sourcePath = resolve(frame.path);
      try {
        if (!statSync(sourcePath).isFile()) {
          throw new Error('path is not a file');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Invalid UI observation record at frames.${index}.path: cannot read image ${sourcePath}: ${message}`,
        );
      }

      let relativePath = copiedPaths.get(sourcePath);
      if (!relativePath) {
        const imageExtension = frame.mimeType === 'image/png' ? 'png' : 'jpeg';
        const fileName = `${String(copiedPaths.size).padStart(4, '0')}.${imageExtension}`;
        relativePath = `${basename(framesDirectory)}/${fileName}`;
        copyFileSync(sourcePath, join(temporaryFramesDirectory, fileName));
        copiedPaths.set(sourcePath, relativePath);
      }
      return { ...frame, path: relativePath };
    });
    const serializedRecord = parseUIObservationRecord({
      ...validated,
      frames,
    });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(
      temporaryManifest,
      JSON.stringify(serializedRecord, null, 2),
      'utf8',
    );
    rmSync(framesDirectory, { recursive: true, force: true });
    renameSync(temporaryFramesDirectory, framesDirectory);
    renameSync(temporaryManifest, outputPath);
    return outputPath;
  } finally {
    rmSync(temporaryFramesDirectory, { recursive: true, force: true });
    rmSync(temporaryManifest, { force: true });
  }
}
