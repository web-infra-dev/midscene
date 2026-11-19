import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { digest, readTrace, writeJsonFile } from '../dist/es/tooling.mjs';

export function inside(root, file) {
  const path = realpathSync(resolve(root, file));
  const rel = relative(realpathSync(root), path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(rel) === rel)
    throw new Error(`Evidence escapes its root: ${file}`);
  return path;
}

/** Resolve existing ancestors too, so symlinks cannot put generated files in the source. */
export function outsideRecording(root, destination) {
  outsideDirectory(root, destination, 'immutable recording directory');
}

export function outsideDirectory(root, destination, description) {
  let existing = resolve(destination);
  const tail = [];
  while (!existsSync(existing)) {
    tail.unshift(basename(existing));
    existing = dirname(existing);
  }
  const path = resolve(realpathSync(existing), ...tail);
  const rel = relative(realpathSync(root), path);
  if (
    rel === '' ||
    (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep))
  )
    throw new Error(`Output must be outside the ${description}`);
}

export function recordingDigest(root) {
  const trace = readTrace(root);
  const files = [
    'trace.json',
    'events.jsonl',
    'frames.json',
    ...Object.values(trace.frames),
  ];
  return Object.fromEntries(
    [...new Set(files)]
      .sort()
      .map((file) => [file, digest(readFileSync(inside(root, file)))]),
  );
}

export function freezeSource(root, destination) {
  const source = {
    version: 6,
    recording: relative(dirname(destination), root),
    files: recordingDigest(root),
  };
  writeJsonFile(destination, source);
  return source;
}

export function readSource(file) {
  const source = JSON.parse(readFileSync(file, 'utf8'));
  const root = resolve(dirname(file), source.recording);
  if (
    source.version !== 6 ||
    Object.entries(source.files).some(
      ([file, hash]) => digest(readFileSync(inside(root, file))) !== hash,
    )
  )
    throw new Error(
      'SOURCE_CHANGED: recording differs from its frozen manifest',
    );
  return { root, source, trace: readTrace(root) };
}
