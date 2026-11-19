import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from '@rstest/core';
import {
  freezeSource,
  outsideRecording,
  readSource,
} from '../scripts/evidence.mjs';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'replay-evidence-'));
  mkdirSync(join(root, 'recording/frames'), { recursive: true });
  mkdirSync(join(root, 'authoring'));
  writeFileSync(
    join(root, 'recording/trace.json'),
    JSON.stringify({ version: 1, start: { screen: 'https://example.test/' } }),
  );
  writeFileSync(join(root, 'recording/events.jsonl'), '');
  writeFileSync(
    join(root, 'recording/frames.json'),
    JSON.stringify({ f: 'frames/a.jpg' }),
  );
  writeFileSync(join(root, 'recording/frames/a.jpg'), 'image');
  freezeSource(join(root, 'recording'), join(root, 'authoring/source.json'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
it('binds raw events and every referenced image to the source manifest', () => {
  const manifest = join(root, 'authoring/source.json');
  expect(readSource(manifest).trace.meta.start.screen).toBe(
    'https://example.test/',
  );
  writeFileSync(join(root, 'recording/frames/a.jpg'), 'changed');
  expect(() => readSource(manifest)).toThrow('SOURCE_CHANGED');
});
it('rejects output through a symlink into the original recording, including missing parents', () => {
  symlinkSync(join(root, 'recording'), join(root, 'alias'));
  expect(() =>
    outsideRecording(
      join(root, 'recording'),
      join(root, 'alias/new/authoring'),
    ),
  ).toThrow('immutable recording');
  expect(() =>
    outsideRecording(join(root, 'recording'), join(root, 'new/authoring')),
  ).not.toThrow();
});
