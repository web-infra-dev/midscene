import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';

/**
 * Carries the current run's manifest namespace from the main process, where
 * `MidsceneReporter` mints it, to the worker processes, which inherit
 * `process.env` when they are spawned. Exported for tests.
 */
export const RUN_ID_ENV = 'MIDSCENE_RSTEST_RUN_ID';

/**
 * Namespace used when nothing minted a run id — i.e. the package is loaded
 * without `MidsceneReporter` configured. Nothing merges or drains those
 * manifests, so they only need a bucket that never collides with a real run's.
 */
const UNCLAIMED_RUN_ID = 'no-reporter';

/**
 * Mint the run id unless one was inherited. Idempotent on purpose: rstest may
 * evaluate the config module (and with it the user's `new MidsceneReporter()`)
 * in a worker as well, and that worker must keep the id it inherited rather
 * than mint a second one the main process knows nothing about.
 */
export function ensureRunId(): string {
  const inherited = process.env[RUN_ID_ENV];
  if (inherited) return inherited;
  const id = `${process.pid.toString(36)}-${randomBytes(4).toString('hex')}`;
  process.env[RUN_ID_ENV] = id;
  return id;
}

/**
 * Manifest files bridge the worker processes (which append one entry per test
 * from fixture teardown) and the reporter in the main process (which merges
 * them per test file). Kept under the `MIDSCENE_RUN_DIR`-aware tmp dir like
 * every other Midscene artifact.
 *
 * Scoped by run id because the reporter clears this directory wholesale: two
 * rstest processes started against the same project would otherwise share one
 * directory, and the later one's pre-clean would delete manifests the earlier
 * one had written but not yet merged — reports vanishing with no error, since
 * a missing manifest legitimately means "no agent ran in this file".
 *
 * Resolved fresh on every call rather than memoized: the directory is removed
 * at run start and run end, so a cached path could outlive its own directory in
 * watch mode. `getMidsceneRunSubDir` already guards its own mkdir, making the
 * repeat cost negligible next to the report write that follows.
 */
export function getManifestDir(): string {
  const dir = join(
    getMidsceneRunSubDir('tmp'),
    'rstest-manifest',
    process.env[RUN_ID_ENV] || UNCLAIMED_RUN_ID,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function manifestKey(testPath: string): string {
  return createHash('sha1').update(testPath).digest('hex').slice(0, 16);
}
