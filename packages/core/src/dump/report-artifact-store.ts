import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
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

/** Stores report data without rendering HTML or owning execution resources. */
const manifestPublications = new Map<string, Promise<void>>();

export class ReportArtifactStore {
  private readonly executionPaths = new Map<string, string>();
  private nextExecution = 0;
  private readonly manifest: ReportArtifactManifest;
  private queue: Promise<void> = Promise.resolve();

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
    const publication = (manifestPublications.get(path) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        let manifest = this.manifest;
        if (this.reuseExistingReport) {
          const existing = await readFile(path, 'utf8').catch((error) => {
            if (error.code === 'ENOENT') return undefined;
            throw error;
          });
          if (existing !== undefined) {
            const previous = parseReportArtifactManifest(JSON.parse(existing));
            if (previous.kind !== manifest.kind)
              throw new Error('Cannot combine different report kinds');
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
      });
    manifestPublications.set(path, publication);
    try {
      await publication;
    } finally {
      if (manifestPublications.get(path) === publication)
        manifestPublications.delete(path);
    }
  }
}
