import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';

let manifestDir: string | undefined;

/**
 * Manifest files bridge the worker processes (which append one entry per test
 * from fixture teardown) and the reporter in the main process (which merges
 * them per test file). Kept under the `MIDSCENE_RUN_DIR`-aware tmp dir like
 * every other Midscene artifact.
 *
 * The path only depends on `process.cwd()` and `MIDSCENE_RUN_DIR`, so it is
 * resolved and created once per process rather than on every test teardown.
 */
export function getManifestDir(): string {
  if (!manifestDir) {
    manifestDir = join(getMidsceneRunSubDir('tmp'), 'rstest-manifest');
    mkdirSync(manifestDir, { recursive: true });
  }
  return manifestDir;
}

/** Only for tests, which point `MIDSCENE_RUN_DIR` at a fresh tmp dir. */
export function resetManifestDirCache(): void {
  manifestDir = undefined;
}

export function manifestKey(testPath: string): string {
  return createHash('sha1').update(testPath).digest('hex').slice(0, 16);
}
