import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { uuid } from '@midscene/shared/utils';

/**
 * Carries the current run's manifest namespace from the main process, where
 * `MidsceneReporter` claims it, to the worker processes, which inherit
 * `process.env` when they are spawned. Exported for tests.
 */
export const RUN_ID_ENV = 'MIDSCENE_RSTEST_RUN_ID';

/**
 * Claim the run id unless one was inherited. Idempotent on purpose: rstest may
 * evaluate the config module (and with it the user's `new MidsceneReporter()`)
 * in a worker as well, and that worker must keep the id it inherited rather
 * than claim a second one the main process knows nothing about.
 */
export function ensureRunId(): string {
  const id = currentRunId() || uuid();
  process.env[RUN_ID_ENV] = id;
  return id;
}

/** The claimed namespace, or `undefined` when no reporter is configured. */
export function currentRunId(): string | undefined {
  return process.env[RUN_ID_ENV];
}

/**
 * Where workers leave one JSONL entry per test for the reporter to merge.
 *
 * Scoped by run id because the reporter clears this directory wholesale, so an
 * unscoped one would let two rstest processes on the same project delete each
 * other's pending manifests — silently, since a missing manifest legitimately
 * means "no agent ran in this file". Resolved fresh on every call rather than
 * memoized, because that same clearing can outlive a cached path in watch mode.
 */
export function manifestDirPath(): string {
  const runId = currentRunId();
  if (!runId) {
    throw new Error(
      `@midscene/rstest: no manifest namespace has been claimed. ${RUN_ID_ENV} is set when the config module constructs MidsceneReporter, so reaching here means the manifest is being used without one.`,
    );
  }
  return join(getMidsceneRunSubDir('tmp'), 'rstest-manifest', runId);
}

/** {@link manifestDirPath}, created. Callers that only delete want the path. */
export function getManifestDir(): string {
  const dir = manifestDirPath();
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function manifestKey(testPath: string): string {
  return createHash('sha1').update(testPath).digest('hex').slice(0, 16);
}
