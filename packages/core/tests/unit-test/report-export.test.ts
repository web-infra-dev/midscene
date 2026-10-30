import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import {
  readReportArtifactManifest,
  readReportDumpScripts,
  readReportRunnerDump,
} from '@/dump/report-artifact-reader';
import { ReportImageStore } from '@/dump/screenshot-store';
import { TestRunReportAssembler, exportReportArtifact } from '@/report';
import { createReportCliCommands } from '@/report-cli';
import { ReportGenerator } from '@/report-generator';
import { ScreenshotItem } from '@/screenshot-item';
import type { TestRunReportDump } from '@/test-run-report';
import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';
import {
  createExecution,
  defaultReportMeta,
  fakeBase64,
  getReportGeneratorTmpDir,
} from './test-helpers/report-generator';

let root: string;
beforeEach(() => {
  root = getReportGeneratorTmpDir('report-export');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function source(mode: 'inline' | 'directory') {
  const path = join(
    root,
    mode,
    mode === 'inline' ? 'source.html' : 'index.html',
  );
  const generator = new ReportGenerator({
    reportPath: path,
    screenshotMode: mode,
    autoPrint: false,
  });
  generator.onExecutionUpdate(
    createExecution(
      [
        ScreenshotItem.create(fakeBase64(80), 100),
        ScreenshotItem.create(fakeBase64(80), 200),
      ],
      'failed search',
      'search',
    ),
    defaultReportMeta,
  );
  await generator.finalize();
  return path;
}

describe('portable report delivery', () => {
  it.each(['inline', 'directory'] as const)(
    'converts %s input to either format and retains independent observations after relocation',
    async (mode) => {
      const input = await source(mode);
      writeFileSync(
        join(dirname(input), 'unused-debug.json'),
        '{"notPartOfReport":true}',
      );
      for (const outputFormat of [
        'single-html',
        'html-and-external-assets',
      ] as const) {
        const exported = await exportReportArtifact({
          reportPath: input,
          outputDir: join(root, 'out'),
          reportFileName: outputFormat,
          outputFormat,
        });
        const moved = join(root, `moved-${outputFormat}`);
        renameSync(
          outputFormat === 'single-html' ? exported : dirname(exported),
          moved,
        );
        const entry =
          outputFormat === 'single-html' ? moved : join(moved, 'index.html');
        const dump = JSON.parse(readReportDumpScripts(entry)[0].content);
        const refs = dump.executions[0].tasks.map(
          (task: any) => task.uiContext.screenshot,
        );
        expect(refs.map((ref: any) => ref.capturedAt)).toEqual([100, 200]);
        expect(refs[0].id).not.toBe(refs[1].id);
        const images = new ReportImageStore({
          reportPath: entry,
          mode: outputFormat === 'single-html' ? 'inline' : 'directory',
        });
        expect(refs.map((ref: any) => images.loadDataUri(ref))).toEqual([
          fakeBase64(80),
          fakeBase64(80),
        ]);
        if (outputFormat === 'html-and-external-assets') {
          expect(refs[0].path).toBe(refs[1].path);
          expect(readdirSync(moved).sort()).toEqual([
            'data',
            'index.html',
            'report.json',
            'screenshots',
          ]);
          expect(readdirSync(join(moved, 'screenshots'))).toHaveLength(1);
          expect(readReportArtifactManifest(entry)?.kind).toBe('agent');
          expect(readFileSync(entry, 'utf8')).not.toContain('failed search');
        } else expect(readFileSync(entry, 'utf8')).toContain(fakeBase64(80));
      }
    },
  );

  it('preserves Test hierarchy and failures through directory and single-file exports', async () => {
    const input = await source('inline');
    const runner = {
      schemaVersion: 1,
      kind: 'test-runner',
      runId: 'test-export',
      status: 'failed',
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(1000).toISOString(),
      durationMs: 1000,
      summary: {
        total: 1,
        passed: 0,
        failed: 1,
        notRun: 0,
        filtered: 0,
        collectionErrors: 0,
        documentFailures: 0,
        projectFailures: 0,
      },
      metrics: {
        modelCallCount: 0,
        modelTimeMs: 0,
        promptTokens: 0,
        cachedInputTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      projects: [],
    } as TestRunReportDump;
    const test = await new TestRunReportAssembler().assembleAsync({
      outputDir: join(root, 'test'),
      reportFileName: 'run',
      sources: [{ scopeId: 'case', sourcePath: input }],
      buildRunnerDump: () => runner,
    });
    const directory = await exportReportArtifact({
      reportPath: test,
      outputDir: join(root, 'exports'),
      reportFileName: 'external',
      outputFormat: 'html-and-external-assets',
    });
    expect(readReportArtifactManifest(directory)?.kind).toBe('test');
    expect(readReportRunnerDump(directory)).toEqual(runner);
    const single = await exportReportArtifact({
      reportPath: directory,
      outputDir: join(root, 'exports'),
      reportFileName: 'single',
    });
    expect(readReportRunnerDump(single)).toEqual(runner);
    expect(readReportDumpScripts(single)).toHaveLength(1);
  });

  it('fails before publishing when an image dependency is missing, preserving its input and the old output', async () => {
    const input = await source('directory');
    const ref = JSON.parse(readReportDumpScripts(input)[0].content)
      .executions[0].tasks[0].uiContext.screenshot;
    unlinkSync(join(dirname(input), ref.path));
    const out = join(root, 'exports');
    mkdirSync(out);
    writeFileSync(join(out, 'broken.html'), 'previous output');
    await expect(
      exportReportArtifact({
        reportPath: input,
        outputDir: out,
        reportFileName: 'broken',
        overwrite: true,
      }),
    ).rejects.toThrow();
    expect(existsSync(input)).toBe(true);
    expect(readFileSync(join(out, 'broken.html'), 'utf8')).toBe(
      'previous output',
    );
    expect(readdirSync(out)).toEqual(['broken.html']);
    await expect(
      exportReportArtifact({
        reportPath: input,
        outputDir: dirname(input),
        reportFileName: 'directory',
        overwrite: true,
        outputFormat: 'html-and-external-assets',
      }),
    ).rejects.toThrow();
    expect(readFileSync(join(out, 'broken.html'), 'utf8')).toBe(
      'previous output',
    );
  });

  it('exports via the report tool with an explicit format and a self-contained default', async () => {
    const input = await source('directory');
    const command = createReportCliCommands()[0].def;
    await command.handler({
      action: 'export',
      htmlPath: input,
      outputDir: join(root, 'cli'),
      outputName: 'single',
    });
    expect(readFileSync(join(root, 'cli/single.html'), 'utf8')).toContain(
      fakeBase64(80),
    );
    await command.handler({
      action: 'export',
      htmlPath: input,
      outputDir: join(root, 'cli'),
      outputName: 'external',
      outputFormat: 'html-and-external-assets',
    });
    expect(
      readReportArtifactManifest(join(root, 'cli/external/index.html'))?.status,
    ).toBe('complete');
  });
});
