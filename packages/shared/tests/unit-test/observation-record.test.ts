import {
  existsSync,
  mkdtempSync,
  readFileSync,
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
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'midscene-record-writer-'));
  directories.push(directory);
  return directory;
}

const dataUrl = (text: string) =>
  `data:image/png;base64,${Buffer.from(text).toString('base64')}`;

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
    expect(readFileSync(resolved.frames[0].path, 'utf8')).toBe('same-frame');
  });

  it('rejects missing, absolute, and escaping image paths', () => {
    const directory = tempDirectory();
    const outputPath = join(directory, 'record.json');
    const baseRecord = {
      type: 'midscene_ui_observation',
      version: 1,
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
      /PNG or JPEG data URL/,
    );
  });
});
