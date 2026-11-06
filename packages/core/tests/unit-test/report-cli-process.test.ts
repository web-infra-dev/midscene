import { fork, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readReportActionDump,
  readReportDumpScripts,
} from '@/dump/report-artifact-reader';
import { deriveCaseStatus } from '@/dump/task-status';
import { ReportGenerator } from '@/report-generator';
import { ScreenshotItem } from '@/screenshot-item';
import { afterEach, describe, expect, it } from '@rstest/core';
import {
  createExecution,
  defaultReportMeta,
  fakeBase64,
} from './test-helpers/report-generator';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const worker = join(__dirname, 'test-helpers/report-cli-process.cjs');
// Deliberately use the installed entry: this is a subprocess integration contract.
const coreEntry = require.resolve('@midscene/core');

describe('CLI report continuation across processes', () => {
  it(
    'appends actions and failures, isolates platforms, and starts a fresh report on reconnect',
    { timeout: 30_000 },
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'cli-report-process-'));
      roots.push(root);
      const invoke = (platform: string, ...args: string[]) =>
        spawnSync(process.execPath, [worker, coreEntry, platform, ...args], {
          cwd: root,
          env: { ...process.env, MIDSCENE_RUN_DIR: join(root, 'midscene_run') },
          encoding: 'utf8',
          timeout: 20_000,
        });
      const session = (platform: string) =>
        JSON.parse(
          readFileSync(
            join(
              root,
              'midscene_run',
              'cli-report-session',
              `midscene-${platform}.json`,
            ),
            'utf8',
          ),
        );
      expect(invoke('android', 'connect').status).toBe(0);
      const original = session('android');
      const first = invoke('android', 'act', '--prompt', 'first action');
      expect(first.status, first.stderr).toBe(0);
      const failure = invoke(
        'android',
        'assert',
        '--prompt',
        'failure evidence',
      );
      expect(failure.status).toBe(1);
      expect(failure.stderr).toContain('planned assertion failure');
      expect(invoke('android', 'act', '--prompt', 'after failure').status).toBe(
        0,
      );
      expect(session('android').reportFileName).toBe(original.reportFileName);
      const dump = await readReportActionDump(original.reportPath);
      expect(dump.executions.map((e) => e.name)).toEqual([
        'Log - first action',
        'failure evidence',
        'Log - after failure',
      ]);
      expect(deriveCaseStatus(dump.executions)).toBe('failed');
      const html = readFileSync(original.reportPath, 'utf8');
      for (const execution of dump.executions) {
        const ref = execution.tasks[0].recorder![0].screenshot!;
        expect(html).toContain(`data-id="${ref.id}"`);
      }
      expect(invoke('ios', 'connect').status).toBe(0);
      expect(invoke('ios', 'act', '--prompt', 'isolated action').status).toBe(
        0,
      );
      const other = session('ios');
      expect(other.reportFileName).not.toBe(original.reportFileName);
      expect(
        (await readReportActionDump(other.reportPath)).executions.map(
          (e) => e.name,
        ),
      ).toEqual(['Log - isolated action']);
      const frozen = readFileSync(original.reportPath, 'utf8');
      expect(invoke('android', 'connect').status).toBe(0);
      expect(
        invoke('android', 'act', '--prompt', 'new connection').status,
      ).toBe(0);
      const next = session('android');
      expect(next.reportFileName).not.toBe(original.reportFileName);
      expect(
        (await readReportActionDump(next.reportPath)).executions.map(
          (e) => e.name,
        ),
      ).toEqual(['Log - new connection']);
      expect(readFileSync(original.reportPath, 'utf8')).toBe(frozen);
      expect(
        readdirSync(join(root, 'midscene_run', 'report')).filter((file) =>
          file.endsWith('.html'),
        ),
      ).toHaveLength(3);
    },
  );
});

describe('report-tool argv with generated Agent artifacts', () => {
  it(
    'publishes only one concurrent CLI export per target across Node processes',
    { timeout: 30_000 },
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'cli-report-publish-'));
      roots.push(root);
      const input = join(root, 'source.html');
      const generator = new ReportGenerator({
        reportPath: input,
        screenshotMode: 'inline',
        autoPrint: false,
      });
      generator.onExecutionUpdate(
        createExecution(
          [ScreenshotItem.create(fakeBase64(80), 100)],
          'source',
          'source',
        ),
        defaultReportMeta,
      );
      await generator.finalize();
      for (const outputFormat of [
        'single-html',
        'html-and-external-assets',
      ] as const) {
        const outputDir = join(root, outputFormat);
        const publishers = [0, 1].map(() => {
          const child = fork(
            worker,
            [
              coreEntry,
              'web',
              'report-tool',
              '--action',
              'export',
              '--htmlPath',
              input,
              '--outputDir',
              outputDir,
              '--outputName',
              'same',
              '--outputFormat',
              outputFormat,
            ],
            {
              cwd: root,
              env: { ...process.env, MIDSCENE_RUN_DIR: join(root, 'run') },
              stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
            },
          );
          let stderr = '';
          child.stderr!.on('data', (chunk) => {
            stderr += chunk;
          });
          const ready = new Promise<void>((resolve, reject) => {
            child.once('message', () => resolve());
            child.once('error', reject);
            child.once('exit', () =>
              reject(new Error(`Publisher exited before ready: ${stderr}`)),
            );
          });
          const done = new Promise<number | null>((resolve, reject) => {
            child.once('error', reject);
            child.once('close', (code) => resolve(code));
          });
          void done.catch(() => {});
          return { child, ready, done };
        });
        try {
          await Promise.all(publishers.map((p) => p.ready));
          for (const publisher of publishers) publisher.child.send('publish');
          const codes = await Promise.all(publishers.map((p) => p.done));
          expect(codes.sort()).toEqual([0, 1]);
          const output = join(
            outputDir,
            outputFormat === 'single-html' ? 'same.html' : 'same/index.html',
          );
          expect(
            (await readReportActionDump(output)).executions.map((e) => e.id),
          ).toEqual(['source']);
          expect(
            readdirSync(outputDir).some((name) => name.startsWith('.')),
          ).toBe(false);
        } finally {
          for (const publisher of publishers)
            if (
              publisher.child.exitCode === null &&
              publisher.child.signalCode === null
            )
              publisher.child.kill('SIGKILL');
          await Promise.allSettled(publishers.map((p) => p.done));
        }
      }
    },
  );

  it.each(['inline', 'directory'] as const)(
    'exports, splits, renders Markdown and merges %s input',
    { timeout: 30_000 },
    async (mode) => {
      const root = mkdtempSync(join(tmpdir(), 'cli-report-tools-'));
      roots.push(root);
      const input = join(
        root,
        'source',
        mode === 'inline' ? 'source.html' : 'index.html',
      );
      const generator = new ReportGenerator({
        reportPath: input,
        screenshotMode: mode,
        autoPrint: false,
      });
      generator.onExecutionUpdate(
        createExecution(
          [
            ScreenshotItem.create(fakeBase64(80), 100),
            ScreenshotItem.create(fakeBase64(80), 200),
          ],
          'CLI fixture',
          'fixture',
        ),
        defaultReportMeta,
      );
      await generator.finalize();
      const invoke = (...args: string[]) => {
        const child = spawnSync(
          process.execPath,
          [worker, coreEntry, 'web', 'report-tool', ...args],
          {
            cwd: root,
            env: {
              ...process.env,
              MIDSCENE_RUN_DIR: join(root, 'midscene_run'),
            },
            encoding: 'utf8',
            timeout: 20_000,
          },
        );
        expect(child.status, child.stderr).toBe(0);
        return child.stdout;
      };
      const outputs: string[] = [];
      for (const outputFormat of [
        'single-html',
        'html-and-external-assets',
      ] as const) {
        invoke(
          '--action',
          'export',
          '--htmlPath',
          mode === 'directory' ? join(root, 'source') : input,
          '--outputDir',
          join(root, 'exports'),
          '--outputName',
          outputFormat,
          '--outputFormat',
          outputFormat,
        );
        outputs.push(
          join(
            root,
            'exports',
            outputFormat === 'single-html'
              ? `${outputFormat}.html`
              : `${outputFormat}/index.html`,
          ),
        );
      }
      rmSync(join(root, 'source'), { recursive: true, force: true });
      for (const [index, output] of outputs.entries()) {
        const artifact = await readReportActionDump(output);
        expect(artifact.executions.map((e) => e.id)).toEqual(['fixture']);
        const screenshots = artifact.executions[0].tasks.map(
          (task) => task.uiContext!.screenshot!,
        );
        expect(screenshots.map((ref) => ref.capturedAt)).toEqual([100, 200]);
        const split = join(root, `split-${index}`);
        const markdown = join(root, `markdown-${index}`);
        invoke('--action', 'split', '--htmlPath', output, '--outputDir', split);
        invoke(
          '--action',
          'to-markdown',
          '--htmlPath',
          output,
          '--outputDir',
          markdown,
        );
        expect(
          readdirSync(split).filter((file) => file.endsWith('.json')),
        ).toHaveLength(1);
        expect(readdirSync(join(split, 'screenshots'))).toHaveLength(1);
        expect(existsSync(join(markdown, 'report.md'))).toBe(true);
        expect(readdirSync(join(markdown, 'screenshots'))).toHaveLength(1);
      }
      for (const outputFormat of [
        'single-html',
        'html-and-external-assets',
      ] as const) {
        invoke(
          '--action',
          'merge-html',
          '--htmlReport',
          outputs[0],
          '--htmlReport',
          outputs[1],
          '--outputDir',
          join(root, 'merged'),
          '--outputName',
          outputFormat,
          '--outputFormat',
          outputFormat,
        );
        const merged = join(
          root,
          'merged',
          outputFormat === 'single-html'
            ? `${outputFormat}.html`
            : `${outputFormat}/index.html`,
        );
        // Both report groups survive; their identical execution identity is still
        // one logical action when read through the replay/deduplication API.
        expect(
          readReportDumpScripts(merged).map((dump) =>
            JSON.parse(dump.content).executions.map(
              (execution: any) => execution.id,
            ),
          ),
        ).toEqual([['fixture'], ['fixture']]);
      }
    },
  );
});
