import { lstat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_FILE_GRACE_MS = DAY_MS;

interface FileUnit {
  absolutePath: string;
  bytes: number;
  modifiedAt: number;
}

interface CleanupPolicy {
  retentionDays: number;
  maxBytes: number;
}

const REPORT_POLICY: CleanupPolicy = {
  retentionDays: 30,
  maxBytes: Number.POSITIVE_INFINITY,
};
const DUMP_POLICY: CleanupPolicy = {
  retentionDays: 7,
  maxBytes: Number.POSITIVE_INFINITY,
};
const OUTPUT_POLICY: CleanupPolicy = {
  retentionDays: 7,
  maxBytes: 1024 * 1024 * 1024,
};
const LOG_POLICY: CleanupPolicy = {
  retentionDays: 7,
  maxBytes: Number.POSITIVE_INFINITY,
};

async function collectFiles(rootPath: string): Promise<FileUnit[]> {
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: FileUnit[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    let entryStats;
    try {
      entryStats = await lstat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }

    if (entryStats.isSymbolicLink()) continue;
    if (entryStats.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }
    if (entryStats.isFile()) {
      files.push({
        absolutePath,
        bytes: entryStats.size,
        modifiedAt: entryStats.mtimeMs,
      });
    }
  }
  return files;
}

async function measurePath(targetPath: string): Promise<FileUnit | null> {
  let targetStats;
  try {
    targetStats = await lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (targetStats.isSymbolicLink()) return null;
  if (targetStats.isFile()) {
    return {
      absolutePath: targetPath,
      bytes: targetStats.size,
      modifiedAt: targetStats.mtimeMs,
    };
  }
  if (!targetStats.isDirectory()) return null;

  let bytes = 0;
  let modifiedAt = 0;
  let hasContent = false;
  let entries;
  try {
    entries = await readdir(targetPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  for (const entry of entries) {
    const measured = await measurePath(path.join(targetPath, entry.name));
    if (!measured) continue;
    hasContent = true;
    bytes += measured.bytes;
    modifiedAt = Math.max(modifiedAt, measured.modifiedAt);
  }
  return {
    absolutePath: targetPath,
    bytes,
    modifiedAt: hasContent ? modifiedAt : targetStats.mtimeMs,
  };
}

async function collectReports(reportRoot: string): Promise<FileUnit[]> {
  let entries;
  try {
    entries = await readdir(reportRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const reports = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() || entry.name.endsWith('.html'))
      .map((entry) => measurePath(path.join(reportRoot, entry.name))),
  );
  return reports.filter((report): report is FileUnit => report !== null);
}

function selectCleanupCandidates(
  files: FileUnit[],
  policy: CleanupPolicy,
  now: number,
): FileUnit[] {
  const sortedFiles = [...files].sort(
    (left, right) => left.modifiedAt - right.modifiedAt,
  );
  let remainingBytes = sortedFiles.reduce((sum, file) => sum + file.bytes, 0);
  const selected: FileUnit[] = [];

  for (const file of sortedFiles) {
    if (now - file.modifiedAt < ACTIVE_FILE_GRACE_MS) continue;
    const expired = now - file.modifiedAt >= policy.retentionDays * DAY_MS;
    const overCapacity = remainingBytes > policy.maxBytes;
    if (!expired && !overCapacity) continue;
    selected.push(file);
    remainingBytes -= file.bytes;
  }
  return selected;
}

/** Cleans disposable files owned exclusively by the Studio run directory. */
export class StudioArtifactCleanup {
  constructor(
    private readonly studioRunDir: string,
    private readonly now: () => number = Date.now,
  ) {}

  private async cleanupRoot(
    relativePath: string,
    policy: CleanupPolicy,
  ): Promise<void> {
    const files = await collectFiles(
      path.join(this.studioRunDir, relativePath),
    );
    for (const file of selectCleanupCandidates(files, policy, this.now())) {
      try {
        await rm(file.absolutePath, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      } catch (error) {
        console.warn('Failed to remove an expired Studio artifact:', error);
      }
    }
  }

  async cleanup(): Promise<void> {
    const reports = await collectReports(
      path.join(this.studioRunDir, 'report'),
    );
    for (const report of selectCleanupCandidates(
      reports,
      REPORT_POLICY,
      this.now(),
    )) {
      try {
        await rm(report.absolutePath, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      } catch (error) {
        console.warn('Failed to remove an expired Studio report:', error);
      }
    }
    await this.cleanupRoot('log', LOG_POLICY);
    await this.cleanupRoot('dump', DUMP_POLICY);
    await this.cleanupRoot('output', OUTPUT_POLICY);
  }
}
