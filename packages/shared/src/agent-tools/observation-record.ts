import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { getMidsceneRunSubDir } from '../common';
import type { UIObservationRecord } from './types';

const observationRecordSchema = z
  .object({
    type: z.literal('midscene_ui_observation'),
    version: z.literal(1),
    frames: z
      .array(
        z
          .object({
            base64: z
              .string()
              .regex(
                /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
                'expected an image data URL',
              ),
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

function defaultObservationRecordPath(): string {
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
  return parseUIObservationRecord(parsed);
}

export function writeUIObservationRecord(
  record: UIObservationRecord,
  filePath?: string,
): string {
  const validated = parseUIObservationRecord(record);
  const resolvedPath = filePath
    ? resolve(filePath)
    : defaultObservationRecordPath();
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, JSON.stringify(validated, null, 2), 'utf8');
  return resolvedPath;
}
