import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  calculateTestRunHealth,
  readReportActionDump,
  readReportArtifactManifest,
  readReportDumpScripts,
  readReportRunnerDump,
} from '@midscene/core/report';
import { setMidsceneRunDir } from '@midscene/shared/common';
import { afterEach, describe, expect, it } from '@rstest/core';
import { runTestProject } from '../src/cli';
import { createMidsceneNodes } from '../src/midscene';

type CoreModule = typeof import('@midscene/core');
const {
  exportReportArtifact,
  mergeReportFiles,
  reportFileToMarkdown,
  splitReportFile,
  createReportCliCommands,
} = createRequire(import.meta.url)('@midscene/core') as CoreModule;
const { runToolsCLI } = createRequire(import.meta.url)(
  '@midscene/shared/cli',
) as typeof import('@midscene/shared/cli');
type ToolsModule = typeof import('@midscene/shared/agent-tools/base-tools');
const { BaseMidsceneTools } = createRequire(import.meta.url)(
  '@midscene/shared/agent-tools/base-tools',
) as ToolsModule;
class ReportOnlyTools extends BaseMidsceneTools {
  protected async ensureAgent(): Promise<never> {
    throw new Error('Report tools must not initialize an Agent.');
  }
  protected createTemporaryDevice() {
    return { actionSpace: () => [] };
  }
  protected preparePlatformTools() {
    return [];
  }
}
const { Agent } = createRequire(import.meta.url)(
  '@midscene/core/agent',
) as typeof import('@midscene/core/agent');
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
const roots: string[] = [];
type Format = 'single-html' | 'html-and-external-assets';
const formats: Format[] = ['single-html', 'html-and-external-assets'];
function temporary() {
  const root = mkdtempSync(join(tmpdir(), 'report-pipeline-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  (globalThis as any).__reportPipeline = undefined;
  setMidsceneRunDir(undefined);
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function* objects(value: unknown): Generator<Record<string, any>> {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value)) yield value as Record<string, any>;
  for (const child of Object.values(value)) yield* objects(child);
}
async function assertPortable(entry: string) {
  const dump = await readReportActionDump(entry);
  const runner = readReportRunnerDump(entry)!;
  const groups = new Map(
    readReportDumpScripts(entry).map(({ openTag, content }) => [
      decodeURIComponent(openTag.match(/data-group-id="([^"]+)"/)![1]),
      JSON.parse(content),
    ]),
  );
  let links = 0;
  for (const value of objects(runner)) {
    if (
      typeof value.reportId === 'string' &&
      typeof value.executionId === 'string'
    ) {
      expect(
        groups
          .get(value.reportId)
          ?.executions.some((e: any) => e.id === value.executionId),
      ).toBe(true);
      links++;
    }
  }
  expect(links).toBeGreaterThan(0);
  const html = readFileSync(entry, 'utf8');
  const refs = [...objects(dump)].filter(
    (value) => value.type === 'midscene_screenshot_ref',
  );
  expect(refs.length).toBeGreaterThan(0);
  for (const ref of refs) {
    if (ref.storage === 'file')
      expect(readFileSync(join(dirname(entry), ref.path))).toEqual(
        Buffer.from(png.split(',')[1], 'base64'),
      );
    else expect(html).toContain(`data-id="${ref.id}">${png}`);
  }
  if (readReportArtifactManifest(entry))
    expect(readdirSync(join(dirname(entry), 'screenshots'))).toHaveLength(1);
  return { dump, runner, refs };
}
async function generate(format: Format) {
  const root = temporary();
  setMidsceneRunDir(join(root, 'sources'));
  (globalThis as any).__reportPipeline = {
    Agent,
    createMidsceneNodes,
    createAgent: () =>
      new Agent(
        {
          interfaceType: 'puppeteer',
          actionSpace: () => [],
          screenshotBase64: async () => png,
          destroy: async () => {},
        } as any,
        {
          autoPrintReportMsg: false,
          modelConfig: {
            MIDSCENE_MODEL_NAME: 'fixture',
            MIDSCENE_MODEL_API_KEY: 'unused',
          },
        },
      ),
  };
  writeFileSync(
    join(root, 'midscene.config.ts'),
    `
    const state = globalThis.__reportPipeline;
    const agents = new Map();
    export default {
      projects: [{name:'desktop',retry:1},{name:'mobile',retry:1}],
      output: {reportFormat: '${format}'},
      nodes: [...state.createMidsceneNodes({agentClass:state.Agent,agentProvider:{
        getAgent(id){if(!agents.has(id))agents.set(id,state.createAgent());return agents.get(id)},
        async releaseAgent(id){await agents.get(id).destroy();agents.delete(id)},
      }}),
      {name:'retry',execute(ctx){if(ctx.case.attemptIndex===0)throw new Error('first attempt failed')}},
      {name:'fail',execute(){throw new Error('planned final failure')}},
      ],
    };
  `,
  );
  writeFileSync(
    join(root, 'case.yaml'),
    `beforeAll:
  - recordToReport: {title: shared setup}
cases:
  - name: success
    steps:
      - recordToReport: {title: repeated frame 1}
      - recordToReport: {title: repeated frame 2}
  - name: retry succeeds
    steps:
      - recordToReport: {title: retry evidence}
      - retry: {}
  - name: final failure
    steps:
      - recordToReport: {title: failure evidence}
      - fail: {}
      - recordToReport: {title: MUST NOT RUN}
afterAll:
  - recordToReport: {title: shared cleanup}
`,
  );
  const result = await runTestProject({ projectRoot: root });
  expect(result.summary).toMatchObject({
    total: 6,
    passed: 4,
    failed: 2,
    passedAfterRetry: 2,
  });
  const delivery = join(
    temporary(),
    format === 'single-html' ? 'report.html' : 'report',
  );
  renameSync(
    format === 'single-html' ? result.reportPath! : dirname(result.reportPath!),
    delivery,
  );
  // The delivered report must not depend on snapshots or images in its old root.
  rmSync(root, { recursive: true, force: true });
  return format === 'single-html' ? delivery : join(delivery, 'index.html');
}

// These integration cases generate and convert several real reports. Allow for
// coverage instrumentation and other projects sharing the CI runner.
const pipelineTimeout = 30_000;

describe('real Test artifacts through report tools', () => {
  it.each(formats)(
    'exports %s runner-only reports and explicitly rejects Agent-detail extraction',
    async (format) => {
      const root = temporary();
      writeFileSync(
        join(root, 'midscene.config.ts'),
        `export default {
      projects:[{name:'local'}],output:{reportFormat:'${format}'},
      nodes:[{name:'local',execute(){}}],
    }`,
      );
      writeFileSync(
        join(root, 'case.yaml'),
        'cases:\n  - name: custom node only\n    steps:\n      - local: {}\n',
      );
      const result = await runTestProject({ projectRoot: root });
      expect(result.summary, JSON.stringify(result.cases)).toMatchObject({
        total: 1,
        passed: 1,
        failed: 0,
      });
      const runner = readReportRunnerDump(result.reportPath!)!;
      for (const outputFormat of formats) {
        const output = await exportReportArtifact({
          reportPath: result.reportPath!,
          outputDir: temporary(),
          reportFileName: 'runner-only',
          outputFormat,
        });
        expect(readReportRunnerDump(output)).toEqual(runner);
        expect(readReportDumpScripts(output)).toHaveLength(0);
        expect(() =>
          splitReportFile({ htmlPath: output, outputDir: temporary() }),
        ).toThrow('No report dump scripts');
        await expect(
          reportFileToMarkdown({ htmlPath: output, outputDir: temporary() }),
        ).rejects.toThrow('No report dump scripts');
      }
    },
    pipelineTimeout,
  );

  it.each(formats)(
    'accepts %s Test artifacts through report-tool argv',
    async (format) => {
      const input = await generate(format);
      const original = await assertPortable(input);
      const invoke = (...argv: string[]) =>
        runToolsCLI(new ReportOnlyTools(), 'midscene', {
          argv: ['report-tool', ...argv],
          extraCommands: createReportCliCommands(),
        });
      for (const outputFormat of formats) {
        const root = temporary();
        await invoke(
          '--action',
          'export',
          '--htmlPath',
          format === 'single-html' ? input : dirname(input),
          '--outputDir',
          root,
          '--outputName',
          'exported',
          '--outputFormat',
          outputFormat,
        );
        const output = join(
          root,
          outputFormat === 'single-html'
            ? 'exported.html'
            : 'exported/index.html',
        );
        expect((await assertPortable(output)).runner).toEqual(original.runner);
        const split = temporary();
        await invoke(
          '--action',
          'split',
          '--htmlPath',
          output,
          '--outputDir',
          split,
        );
        expect(
          readdirSync(split).filter((file) => file.endsWith('.json')),
        ).toHaveLength(original.dump.executions.length);
        const markdown = temporary();
        await invoke(
          '--action',
          'to-markdown',
          '--htmlPath',
          output,
          '--outputDir',
          markdown,
        );
        expect(existsSync(join(markdown, 'report.md'))).toBe(true);
        const merged = temporary();
        await invoke(
          '--action',
          'merge-html',
          '--htmlReport',
          input,
          '--htmlReport',
          output,
          '--outputDir',
          merged,
          '--outputName',
          'merged',
          '--outputFormat',
          outputFormat,
        );
        const combined = await assertPortable(
          join(
            merged,
            outputFormat === 'single-html'
              ? 'merged.html'
              : 'merged/index.html',
          ),
        );
        expect(combined.runner.summary.total).toBe(12);
        expect(combined.runner.projects).toHaveLength(4);
      }
    },
    pipelineTimeout,
  );

  it.each(formats)(
    'preserves hierarchy, attempts, traces and images from %s through both output formats',
    async (format) => {
      const input = await generate(format);
      const original = await assertPortable(input);
      expect(original.runner.projects).toHaveLength(2);
      expect(
        original.dump.executions.some((e) => e.name.includes('MUST NOT RUN')),
      ).toBe(false);
      for (const outputFormat of formats) {
        const exported = await exportReportArtifact({
          reportPath: input,
          outputDir: temporary(),
          reportFileName: 'exported',
          outputFormat,
        });
        const restored = await assertPortable(exported);
        expect(restored.runner).toEqual(original.runner);
        expect(restored.refs.map((ref) => [ref.id, ref.capturedAt])).toEqual(
          original.refs.map((ref) => [ref.id, ref.capturedAt]),
        );
        expect(restored.dump.executions.map((e) => e.id)).toEqual(
          original.dump.executions.map((e) => e.id),
        );
        const back = await exportReportArtifact({
          reportPath: exported,
          outputDir: temporary(),
          reportFileName: 'back',
          outputFormat: format,
        });
        expect((await assertPortable(back)).runner).toEqual(original.runner);
        const split = splitReportFile({
          htmlPath: exported,
          outputDir: temporary(),
        });
        expect(
          split.executionJsonFiles.flatMap((file) =>
            JSON.parse(readFileSync(file, 'utf8')).executions.map(
              (e: any) => e.id,
            ),
          ),
        ).toEqual(original.dump.executions.map((e) => e.id));
        expect(split.screenshotFiles.every(existsSync)).toBe(true);
        const markdown = await reportFileToMarkdown({
          htmlPath: exported,
          outputDir: temporary(),
        });
        expect(markdown.markdownFiles.length).toBeGreaterThan(0);
        expect(markdown.screenshotFiles.every(existsSync)).toBe(true);
      }
    },
    pipelineTimeout,
  );

  it.each(formats)(
    'preserves overlapping IDs, retry history and trace links through mixed-format merge and remerge to %s',
    async (outputFormat) => {
      const inputs = [
        await generate('single-html'),
        await generate('html-and-external-assets'),
      ];
      const merged = mergeReportFiles({
        htmlPaths: inputs,
        outputDir: temporary(),
        outputName: 'merged',
        outputFormat,
      }).mergedReportPath;
      const first = await assertPortable(merged);
      expect(first.runner.summary).toMatchObject({
        total: 12,
        passed: 8,
        failed: 4,
      });
      const health = (runner: typeof first.runner) =>
        calculateTestRunHealth(
          runner.projects.flatMap((p) =>
            p.documents.flatMap((d) =>
              d.cases.map((c) => ({ ...c, retryCount: d.attemptIndex ?? 0 })),
            ),
          ),
        );
      expect(health(first.runner)).toMatchObject({
        passedAfterRetry: 4,
        finalPassRate: 8 / 12,
        firstPassRate: 4 / 12,
      });
      expect(first.runner.projects).toHaveLength(4);
      const attempts = (runner: typeof first.runner) =>
        runner.projects
          .flatMap((p) => p.documents)
          .flatMap((d) => d.cases)
          .flatMap((c) => c.attempts.map((a) => a.status));
      expect(
        attempts(first.runner).filter((status) => status === 'failed'),
      ).toHaveLength(12);
      const again = mergeReportFiles({
        htmlPaths: [merged],
        outputDir: temporary(),
        outputName: 'again',
        outputFormat,
      }).mergedReportPath;
      const second = await assertPortable(again);
      expect(second.runner.summary).toEqual(first.runner.summary);
      expect(second.runner.metrics).toEqual(first.runner.metrics);
      expect(health(second.runner)).toEqual(health(first.runner));
      expect(attempts(second.runner)).toEqual(attempts(first.runner));
    },
    pipelineTimeout,
  );
});
