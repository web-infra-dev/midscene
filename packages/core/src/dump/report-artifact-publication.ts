import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  linkSync,
  openSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { link, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { withReportArtifactLock } from './report-artifact-store';

function publicationLockName(destination: string): string {
  const id = createHash('sha256').update(resolve(destination)).digest('hex');
  return `.report-publish-${id}.lock`;
}

function assertAvailable(destination: string, overwrite: boolean): void {
  if (!overwrite && existsSync(destination))
    throw new Error(`Report artifact already exists: ${destination}`);
}

/** The prepared artifact and destination share a filesystem. Lock only the
 * final publication, and never remove the other format's sibling artifact. */
export async function publishReportArtifact(
  prepared: string,
  destination: string,
  directory: boolean,
  overwrite = false,
): Promise<void> {
  await withReportArtifactLock(
    dirname(destination),
    async () => {
      assertAvailable(destination, overwrite);
      if (directory) {
        if (overwrite) await rm(destination, { recursive: true, force: true });
        await rename(prepared, destination);
      } else if (overwrite) {
        await rename(prepared, destination);
      } else {
        // Unlike rename, link cannot replace a file created after the check.
        await link(prepared, destination);
      }
    },
    10_000,
    publicationLockName(destination),
  );
}

export function publishReportArtifactSync(
  prepared: string,
  destination: string,
  directory: boolean,
  overwrite = false,
): void {
  const lockPath = join(dirname(destination), publicationLockName(destination));
  // A synchronous caller must not block the event loop waiting for an async
  // publisher in this same process. A busy destination fails without changes.
  const lock = openSync(lockPath, 'wx');
  try {
    writeFileSync(lock, JSON.stringify({ pid: process.pid }));
    assertAvailable(destination, overwrite);
    if (directory) {
      if (overwrite) rmSync(destination, { recursive: true, force: true });
      renameSync(prepared, destination);
    } else if (overwrite) {
      renameSync(prepared, destination);
    } else {
      linkSync(prepared, destination);
    }
  } finally {
    try {
      closeSync(lock);
    } finally {
      unlinkSync(lockPath);
    }
  }
}
