import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  type ReportArtifactManifest,
  parseReportArtifactManifest,
} from '@midscene/shared/report-artifact';
import { uuid } from '@midscene/shared/utils';
import type { TestRunReportDump } from '../test-run-report';
import { getReportTpl, reportHTMLContent } from '../utils';
import {
  generateReportArtifactScriptTag,
  generateTestRunReportScriptTag,
  getBaseUrlFixScript,
} from './html-utils';
import { writeReportArtifactFile } from './report-artifact-store';
import { TestReportImages } from './test-report-images';

export type ReportGroupAttributes = Record<string, string | number | boolean>;

/** Final publisher shared by Test, report merging, and format conversion. */
export class ReportArtifactWriter {
  private readonly manifest: ReportArtifactManifest;
  private readonly images: TestReportImages;

  constructor(
    private readonly entry: string,
    private readonly external: boolean,
    kind: 'agent' | 'test',
    reportId = uuid(),
  ) {
    this.manifest = {
      schemaVersion: 1,
      kind,
      reportId,
      entry: basename(entry),
      status: 'complete',
      groups: [],
    };
    this.images = new TestReportImages(entry, external);
  }

  private get template(): string {
    const template = getReportTpl();
    const end = template.lastIndexOf('</html>');
    return (
      (end < 0 ? template : template.slice(0, end)) +
      (this.external ? getBaseUrlFixScript() : '')
    );
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.entry), { recursive: true });
    await writeFile(this.entry, this.template);
  }
  initializeSync(): void {
    mkdirSync(dirname(this.entry), { recursive: true });
    writeFileSync(this.entry, this.template);
  }

  private group(id: string, attributes: ReportGroupAttributes) {
    if (this.manifest.groups.some((group) => group.id === id))
      throw new Error(`Duplicate report group: ${id}`);
    const path = `data/group-${this.manifest.groups.length + 1}/1.json`;
    this.manifest.groups.push({
      id,
      status: 'complete',
      attributes: { ...attributes, 'data-screenshot-mode': 'directory' },
      dumps: [path],
    });
    return join(dirname(this.entry), path);
  }

  private inlineGroup(
    id: string,
    attributes: ReportGroupAttributes,
    serialized: string,
  ): string {
    return reportHTMLContent(
      {
        dumpString: serialized,
        attributes: {
          ...attributes,
          'data-group-id': id,
          'data-screenshot-mode': 'inline',
          'data-report-kind': this.manifest.kind,
        },
      },
      undefined,
      undefined,
      false,
    );
  }

  async addGroup(
    id: string,
    serialized: string,
    sourcePath: string,
    attributes: ReportGroupAttributes,
    origins?: ReadonlyMap<string, string>,
  ): Promise<void> {
    const rewritten = await this.images.rewriteAsync(
      serialized,
      sourcePath,
      origins,
    );
    if (this.external)
      await writeReportArtifactFile(this.group(id, attributes), rewritten);
    else
      await appendFile(this.entry, this.inlineGroup(id, attributes, rewritten));
  }
  addGroupSync(
    id: string,
    serialized: string,
    sourcePath: string,
    attributes: ReportGroupAttributes,
    origins?: ReadonlyMap<string, string>,
  ): void {
    const rewritten = this.images.rewriteSync(serialized, sourcePath, origins);
    if (this.external) {
      const file = this.group(id, attributes);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, rewritten);
    } else
      appendFileSync(this.entry, this.inlineGroup(id, attributes, rewritten));
  }

  private footer(
    runner: TestRunReportDump | undefined,
    comment: string,
  ): string {
    const data = this.external
      ? generateReportArtifactScriptTag('report.json')
      : runner
        ? generateTestRunReportScriptTag(runner)
        : '';
    return `${data}${comment}\n</html>\n`;
  }

  async finish(runner?: TestRunReportDump, comment = ''): Promise<void> {
    if (this.external) {
      if (runner) {
        this.manifest.runner = 'data/runner.json';
        await writeReportArtifactFile(
          join(dirname(this.entry), this.manifest.runner),
          JSON.stringify(runner),
        );
      }
      parseReportArtifactManifest(this.manifest);
      await writeReportArtifactFile(
        join(dirname(this.entry), 'report.json'),
        JSON.stringify(this.manifest),
      );
    }
    await appendFile(this.entry, this.footer(runner, comment));
  }
  finishSync(runner?: TestRunReportDump, comment = ''): void {
    if (this.external) {
      if (runner) {
        this.manifest.runner = 'data/runner.json';
        mkdirSync(join(dirname(this.entry), 'data'), { recursive: true });
        writeFileSync(
          join(dirname(this.entry), this.manifest.runner),
          JSON.stringify(runner),
        );
      }
      parseReportArtifactManifest(this.manifest);
      writeFileSync(
        join(dirname(this.entry), 'report.json'),
        JSON.stringify(this.manifest),
      );
    }
    appendFileSync(this.entry, this.footer(runner, comment));
  }
}
