import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';

/**
 * Manifest files bridge the worker processes (which write the merged report
 * path in `afterAll`) and the reporter in the main process (which prints it).
 * Kept under the `MIDSCENE_RUN_DIR`-aware tmp dir like every other Midscene
 * artifact.
 */
export function getManifestDir(): string {
  return join(getMidsceneRunSubDir('tmp'), 'rstest-manifest');
}

export function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` +
    `${pad(now.getMilliseconds(), 3)}`
  );
}

export function manifestKey(testPath: string): string {
  return createHash('sha1').update(testPath).digest('hex').slice(0, 16);
}
