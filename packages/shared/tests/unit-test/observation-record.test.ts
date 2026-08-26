import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import {
  UIObservationRecordWriter,
  readUIObservationRecord,
  writeUIObservationRecord,
} from '@/agent-tools/observation-record';
import { afterEach, describe, expect, it } from '@rstest/core';

const directories: string[] = [];

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'midscene-record-writer-'));
  directories.push(directory);
  return directory;
}

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const dataUrl = (text: string) =>
  `data:image/png;base64,${Buffer.concat([
    pngSignature,
    Buffer.from(text),
  ]).toString('base64')}`;
const webpDataUrl =
  'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

describe('UIObservationRecordWriter', () => {
  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('exports a file-backed record and writes a portable JSON manifest', () => {
    const directory = tempDirectory();
    const outputPath = join(directory, 'submission-observation.json');
    const writer = new UIObservationRecordWriter(
      join(directory, 'internal-observation.json'),
    );
    const first = writer.persistFrame(dataUrl('same-frame'), 100);
    const second = writer.persistFrame(dataUrl('same-frame'), 200);

    const record = writer.finalize([first, second], {
      startedAt: 50,
      endedAt: 250,
      shotSize: { width: 100, height: 50 },
      shrunkShotToLogicalRatio: 1,
    });

    expect(first.path).toBe(second.path);
    expect(isAbsolute(record.frames[0].path)).toBe(true);
    expect(existsSync(record.frames[0].path)).toBe(true);
    expect(writeUIObservationRecord(record, outputPath)).toBe(outputPath);

    const serialized = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(serialized.frames[0]).toEqual({
      path: 'submission-observation.frames/0000.png',
      mimeType: 'image/png',
      capturedAt: 100,
    });
    expect(JSON.stringify(serialized)).not.toContain('base64');
    expect(isAbsolute(serialized.frames[0].path)).toBe(false);

    const resolved = readUIObservationRecord(outputPath);
    expect(isAbsolute(resolved.frames[0].path)).toBe(true);
    expect(existsSync(resolved.frames[0].path)).toBe(true);
    expect(readFileSync(resolved.frames[0].path)).toEqual(
      Buffer.from(dataUrl('same-frame').split(',')[1], 'base64'),
    );
  });

  it('rejects missing, absolute, and escaping image paths', () => {
    const directory = tempDirectory();
    const outputPath = join(directory, 'record.json');
    const baseRecord = {
      type: 'midscene_ui_observation',
      version: 1,
      startedAt: 50,
      endedAt: 150,
      shotSize: { width: 100, height: 50 },
      shrunkShotToLogicalRatio: 1,
    };

    for (const path of [
      'record.frames/missing.png',
      join(directory, 'absolute.png'),
      '../escaping.png',
    ]) {
      writeFileSync(
        outputPath,
        JSON.stringify({
          ...baseRecord,
          frames: [{ path, mimeType: 'image/png', capturedAt: 100 }],
        }),
      );
      expect(() => readUIObservationRecord(outputPath)).toThrow(
        /frames\.0\.path/,
      );
    }
  });

  it('rejects non-image data URLs before writing', () => {
    const writer = new UIObservationRecordWriter(
      join(tempDirectory(), 'record.json'),
    );
    expect(() => writer.persistFrame('not-an-image', 100)).toThrow(
      /UI observation frame/,
    );
  });

  it('rejects frame MIME metadata that disagrees with encoded bytes', () => {
    const writer = new UIObservationRecordWriter(
      join(tempDirectory(), 'record.json'),
    );
    const mismatched = webpDataUrl.replace('image/webp', 'image/png');

    expect(() => writer.persistFrame(mismatched, 100)).toThrow(
      'declares image/png but encoded bytes are image/webp',
    );
  });

  it('persists and exports WebP frames with WebP metadata', () => {
    const directory = tempDirectory();
    const writer = new UIObservationRecordWriter(
      join(directory, 'record.json'),
    );
    const frame = writer.persistFrame(webpDataUrl, 100);

    expect(frame.mimeType).toBe('image/webp');
    expect(frame.path).toMatch(/\.webp$/);
    expect(existsSync(writer.resolveFramePath(frame))).toBe(true);

    const record = writer.finalize([frame], {
      startedAt: 50,
      endedAt: 150,
      shotSize: { width: 2, height: 3 },
      shrunkShotToLogicalRatio: 1,
    });
    const outputPath = join(directory, 'exported-record.json');
    writeUIObservationRecord(record, outputPath);

    const serialized = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(serialized.frames[0]).toEqual({
      path: 'exported-record.frames/0000.webp',
      mimeType: 'image/webp',
      capturedAt: 100,
    });
    const resolved = readUIObservationRecord(outputPath);
    expect(readFileSync(resolved.frames[0].path)).toEqual(
      Buffer.from(webpDataUrl.split(',')[1], 'base64'),
    );
  });

  it('rejects an observation whose end precedes its start', () => {
    const directory = tempDirectory();
    const outputPath = join(directory, 'record.json');
    writeFileSync(
      outputPath,
      JSON.stringify({
        type: 'midscene_ui_observation',
        version: 1,
        startedAt: 200,
        endedAt: 100,
        frames: [
          {
            path: 'record.frames/frame.png',
            mimeType: 'image/png',
            capturedAt: 100,
          },
        ],
        shotSize: { width: 100, height: 50 },
        shrunkShotToLogicalRatio: 1,
      }),
    );

    expect(() => readUIObservationRecord(outputPath)).toThrow(/endedAt/);
  });

  it('keeps only files referenced by the finalized record', () => {
    const writer = new UIObservationRecordWriter(
      join(tempDirectory(), 'record.json'),
    );
    const frames = Array.from({ length: 12 }, (_, index) =>
      writer.persistFrame(dataUrl(`frame-${index}`), index),
    );

    const record = writer.finalize(frames.slice(-2), {
      startedAt: 0,
      endedAt: 20,
      shotSize: { width: 100, height: 50 },
      shrunkShotToLogicalRatio: 1,
    });

    expect(record.frames).toHaveLength(2);
    expect(readdirSync(writer.framesDirectory)).toHaveLength(2);
  });

  it('disposes temporary and finalized frame directories', () => {
    const writer = new UIObservationRecordWriter(
      join(tempDirectory(), 'record.json'),
    );
    const frame = writer.persistFrame(dataUrl('frame'), 100);
    const temporaryFramePath = writer.resolveFramePath(frame);

    expect(existsSync(temporaryFramePath)).toBe(true);
    writer.dispose();
    expect(existsSync(temporaryFramePath)).toBe(false);

    const finalizedWriter = new UIObservationRecordWriter(
      join(tempDirectory(), 'finalized-record.json'),
    );
    const finalizedFrame = finalizedWriter.persistFrame(dataUrl('frame'), 100);
    finalizedWriter.finalize([finalizedFrame], {
      startedAt: 50,
      endedAt: 150,
      shotSize: { width: 100, height: 50 },
      shrunkShotToLogicalRatio: 1,
    });

    expect(existsSync(finalizedWriter.framesDirectory)).toBe(true);
    finalizedWriter.dispose();
    expect(existsSync(finalizedWriter.framesDirectory)).toBe(false);
  });
});
