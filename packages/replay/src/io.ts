import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';
export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');

function writeExclusive(path: string, bytes: Uint8Array | string) {
  const fd = openSync(path, 'wx');
  try {
    const buffer = typeof bytes === 'string' ? Buffer.from(bytes) : bytes;
    let written = 0;
    while (written < buffer.length) written += writeSync(fd, buffer, written);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Write JSON atomically; refuses to replace an existing file unless asked. */
export function writeJsonFile(path: string, value: unknown, replace = false) {
  if (!replace && existsSync(path))
    throw new Error(`Refusing to overwrite ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeExclusive(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try {
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
