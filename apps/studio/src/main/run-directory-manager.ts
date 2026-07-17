import { lstat, readdir, rm, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_FILE_GRACE_MS = DAY_MS;
const DATE_DIRECTORY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CATEGORY_POLICIES = {
  log: { retentionDays: 7, maxBytes: 200 * 1024 * 1024 },
  dump: { retentionDays: 7, maxBytes: 500 * 1024 * 1024 },
  tmp: { retentionDays: 1, maxBytes: 200 * 1024 * 1024 },
  cache: { retentionDays: 30, maxBytes: 1024 * 1024 * 1024 },
  output: { retentionDays: 14, maxBytes: 1024 * 1024 * 1024 },
  report: { retentionDays: 30, maxBytes: Number.POSITIVE_INFINITY },
} as const;

type RunDirectoryCategory = keyof typeof CATEGORY_POLICIES;

interface ManagedUnit {
  absolutePath: string;
  category: RunDirectoryCategory;
  bytes: number;
  modifiedAt: number;
  lastUsedAt: number;
  managed: boolean;
}

async function measurePath(targetPath: string): Promise<{
  bytes: number;
  modifiedAt: number;
  lastUsedAt: number;
  hasSymlink: boolean;
}> {
  const targetStats = await lstat(targetPath);
  if (targetStats.isSymbolicLink()) {
    return {
      bytes: 0,
      modifiedAt: targetStats.mtimeMs,
      lastUsedAt: Math.max(targetStats.mtimeMs, targetStats.atimeMs),
      hasSymlink: true,
    };
  }
  if (!targetStats.isDirectory()) {
    return {
      bytes: targetStats.size,
      modifiedAt: targetStats.mtimeMs,
      lastUsedAt: Math.max(targetStats.mtimeMs, targetStats.atimeMs),
      hasSymlink: false,
    };
  }

  let bytes = 0;
  let modifiedAt = targetStats.mtimeMs;
  let lastUsedAt = Math.max(targetStats.mtimeMs, targetStats.atimeMs);
  let hasSymlink = false;
  for (const entry of await readdir(targetPath, { withFileTypes: true })) {
    const measured = await measurePath(path.join(targetPath, entry.name));
    bytes += measured.bytes;
    modifiedAt = Math.max(modifiedAt, measured.modifiedAt);
    lastUsedAt = Math.max(lastUsedAt, measured.lastUsedAt);
    hasSymlink ||= measured.hasSymlink;
  }
  return { bytes, modifiedAt, lastUsedAt, hasSymlink };
}

async function isRecognizedLegacyUnit(
  category: RunDirectoryCategory,
  absolutePath: string,
  name: string,
): Promise<boolean> {
  if (category === 'log') return name.endsWith('.log');
  if (category === 'report') {
    if (name.endsWith('.html')) return true;
    try {
      return (await stat(path.join(absolutePath, 'index.html'))).isFile();
    } catch {
      return false;
    }
  }
  if (category === 'output') {
    return name.endsWith('.json') || name === 'recorder-screenshots';
  }
  if (category === 'dump') {
    return name === 'recorder-ai-describe-screenshots';
  }
  if (category === 'tmp') return name.startsWith('rstest-yaml-');
  return category === 'cache';
}

export class RunDirectoryManager {
  constructor(
    private readonly rootPath: string,
    private readonly now: () => number = Date.now,
  ) {}

  private async collectUnits(
    category: RunDirectoryCategory,
  ): Promise<ManagedUnit[]> {
    const categoryPath = path.join(this.rootPath, category);
    let entries;
    try {
      entries = await readdir(categoryPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const candidates: Array<{
      absolutePath: string;
      name: string;
      partitioned: boolean;
    }> = [];
    for (const entry of entries) {
      const absolutePath = path.join(categoryPath, entry.name);
      if (
        category === 'report' &&
        entry.isDirectory() &&
        DATE_DIRECTORY_PATTERN.test(entry.name)
      ) {
        for (const child of await readdir(absolutePath, {
          withFileTypes: true,
        })) {
          candidates.push({
            absolutePath: path.join(absolutePath, child.name),
            name: child.name,
            partitioned: true,
          });
        }
      } else {
        candidates.push({
          absolutePath,
          name: entry.name,
          partitioned:
            entry.isDirectory() && DATE_DIRECTORY_PATTERN.test(entry.name),
        });
      }
    }

    return Promise.all(
      candidates.map(async (candidate) => {
        const measured = await measurePath(candidate.absolutePath);
        return {
          absolutePath: candidate.absolutePath,
          category,
          bytes: measured.bytes,
          modifiedAt: measured.modifiedAt,
          lastUsedAt: measured.lastUsedAt,
          managed:
            !measured.hasSymlink &&
            (candidate.partitioned ||
              (await isRecognizedLegacyUnit(
                category,
                candidate.absolutePath,
                candidate.name,
              ))),
        };
      }),
    );
  }

  private selectCleanupCandidates(
    category: RunDirectoryCategory,
    units: ManagedUnit[],
  ): ManagedUnit[] {
    const policy = CATEGORY_POLICIES[category];
    const now = this.now();
    const managedUnits = units
      .filter((unit) => unit.managed)
      .sort((left, right) => {
        const leftTime =
          category === 'cache' ? left.lastUsedAt : left.modifiedAt;
        const rightTime =
          category === 'cache' ? right.lastUsedAt : right.modifiedAt;
        return leftTime - rightTime;
      });
    let remainingBytes = managedUnits.reduce(
      (sum, unit) => sum + unit.bytes,
      0,
    );
    const selected: ManagedUnit[] = [];
    for (const unit of managedUnits) {
      const retentionTimestamp =
        category === 'cache' ? unit.lastUsedAt : unit.modifiedAt;
      const oldEnoughForSafety =
        now - retentionTimestamp >= ACTIVE_FILE_GRACE_MS;
      const expired = now - retentionTimestamp >= policy.retentionDays * DAY_MS;
      const overCapacity = remainingBytes > policy.maxBytes;
      if (!oldEnoughForSafety || (!expired && !overCapacity)) continue;
      selected.push(unit);
      remainingBytes -= unit.bytes;
    }
    return selected;
  }

  async cleanup(): Promise<void> {
    for (const category of Object.keys(
      CATEGORY_POLICIES,
    ) as RunDirectoryCategory[]) {
      const units = await this.collectUnits(category);
      for (const unit of this.selectCleanupCandidates(category, units)) {
        await rm(unit.absolutePath, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
        const categoryPath = path.join(this.rootPath, category);
        const parentPath = path.dirname(unit.absolutePath);
        if (parentPath !== categoryPath) {
          await rmdir(parentPath).catch(() => undefined);
        }
      }
    }
  }
}
