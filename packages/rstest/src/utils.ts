import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';

/**
 * Manifest files bridge the worker processes (which append one entry per test
 * from fixture teardown) and the reporter in the main process (which merges
 * them per test file). Kept under the `MIDSCENE_RUN_DIR`-aware tmp dir like
 * every other Midscene artifact.
 *
 * Resolved fresh on every call rather than memoized: `MidsceneReporter`
 * removes this directory at run start, so a cached path would survive its own
 * directory in watch mode. `getMidsceneRunSubDir` already guards its own mkdir,
 * making the repeat cost negligible next to the report write that follows.
 */
export function getManifestDir(): string {
  const dir = join(getMidsceneRunSubDir('tmp'), 'rstest-manifest');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function manifestKey(testPath: string): string {
  return createHash('sha1').update(testPath).digest('hex').slice(0, 16);
}
