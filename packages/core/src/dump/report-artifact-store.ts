import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  type ReportArtifactManifest,
  parseReportArtifactManifest,
} from '@midscene/shared/report-artifact';
import { uuid } from '@midscene/shared/utils';

/** Publish individual files atomically; readers never observe truncated JSON. */
export async function writeReportArtifactFile(
  path: string,
  content: string | Uint8Array,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${uuid()}.tmp`;
  try {
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

/** Serialize the entire read/merge/write transaction across Node processes. */
export async function withReportArtifactLock<T>(
  root: string,
  publish: () => Promise<T>,
  timeoutMs = 10_000,
): Promise<T> {
  const lockPath = resolve(root, '.report.json.lock');
  await mkdir(dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  const acquire = async () => {
    while (true) {
      try {
        return await open(lockPath, 'wx');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() - startedAt >= timeoutMs) {
          throw new Error(
            `Timed out waiting for report artifact lock ${lockPath}. Another publisher may still be running. If its owner crashed, remove the lock only after confirming that process has exited.`,
            { cause: error },
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 20 + Math.random() * 10),
        );
      }
    }
  };
  const lock = await acquire();
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    return await publish();
  } finally {
    // Never expire a live publisher's lock based on elapsed time: a slow
    // filesystem or paused process must not result in two simultaneous owners.
    await lock.close().finally(() => unlink(lockPath));
  }
}

/** Stores report data without rendering HTML or owning execution resources. */
export class ReportArtifactStore {
  private readonly executionPaths = new Map<string, string>();
  private nextExecution = 0;
  private readonly manifest: ReportArtifactManifest;
  private queue: Promise<void> = Promise.resolve();
  private hasPublished = false;

  constructor(
    private readonly root: string,
    reportId: string,
    kind: 'agent' | 'test' = 'agent',
    private readonly reuseExistingReport = false,
    entry = 'index.html',
  ) {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(reportId))
      throw new Error('Invalid report artifact ID');
    this.manifest = {
      schemaVersion: 1,
      kind,
      status: 'running',
      reportId,
      entry,
      groups: [{ id: reportId, attributes: {}, dumps: [] }],
    };
  }

  async writeExecution(
    key: string,
    serialized: string,
    attributes: Record<string, string>,
  ): Promise<void> {
    this.queue = this.queue.then(async () => {
      let path = this.executionPaths.get(key);
      if (!path) {
        path = `data/${this.manifest.reportId}/${++this.nextExecution}.json`;
        this.executionPaths.set(key, path);
      }
      await writeReportArtifactFile(join(this.root, path), serialized);
      const group = this.manifest.groups[0];
      group.attributes = attributes;
      if (!group.dumps.includes(path)) group.dumps.push(path);
      await this.publish();
    });
    await this.queue;
  }

  async writeRunner(serialized: string): Promise<void> {
    this.queue = this.queue.then(async () => {
      const path = `data/${this.manifest.reportId}/runner.json`;
      await writeReportArtifactFile(join(this.root, path), serialized);
      this.manifest.runner = path;
      await this.publish();
    });
    await this.queue;
  }

  async finalize(): Promise<void> {
    this.queue = this.queue.then(async () => {
      this.manifest.status = 'complete';
      await this.publish();
    });
    await this.queue;
  }

  private async publish(): Promise<void> {
    const path = resolve(this.root, 'report.json');
    await withReportArtifactLock(this.root, async () => {
      let manifest = this.manifest;
      if (this.reuseExistingReport || this.hasPublished) {
        const existing = await readFile(path, 'utf8').catch((error) => {
          if (error.code === 'ENOENT') return undefined;
          throw error;
        });
        if (existing !== undefined) {
          const previous = parseReportArtifactManifest(JSON.parse(existing));
          if (
            previous.kind !== manifest.kind ||
            previous.entry !== manifest.entry
          )
            throw new Error(
              'Cannot combine reports with different kinds or entries',
            );
          manifest = {
            ...previous,
            status: manifest.status,
            groups: [
              ...previous.groups.filter(
                (group) => group.id !== manifest.reportId,
              ),
              ...manifest.groups,
            ],
            runner: manifest.runner ?? previous.runner,
          };
        }
      }
      parseReportArtifactManifest(manifest);
      await writeReportArtifactFile(path, JSON.stringify(manifest));
      this.hasPublished = true;
    });
  }
}
