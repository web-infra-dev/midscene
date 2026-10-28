import { fork } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ExecutionRecorder } from '@/dump/execution-recorder';
import {
  ReportArtifactStore,
  withReportArtifactLock,
} from '@/dump/report-artifact-store';
import { ScreenshotItem } from '@/screenshot-item';
import { ExecutionDump } from '@/types';
import { afterEach, describe, expect, it, rs } from '@rstest/core';
import {
  createExecution,
  defaultReportMeta,
  fakeBase64,
  getReportGeneratorTmpDir,
} from './test-helpers/report-generator';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('execution recording without HTML', () => {
  it('freezes selected executions, recorded frames, errors and reference images before persistence', () => {
    const recorder = new ExecutionRecorder();
    const first = ScreenshotItem.create(fakeBase64(80), 100);
    const frame = ScreenshotItem.create(fakeBase64(100), 200);
    const reference = fakeBase64(120, 'webp');
    const execution = createExecution([first], 'before', 'selected');
    execution.tasks[0].errorMessage = 'assertion failed';
    execution.tasks[0].recorder = [
      { type: 'screenshot', ts: 200, screenshot: frame },
    ];
    const registered = new ExecutionDump(execution.toJSON(), {
      referenceImageUrls: [reference],
    });
    recorder.record(registered, defaultReportMeta);
    recorder.record(createExecution([], 'other', 'other'), defaultReportMeta);
    const snapshot = recorder.capture(['selected']);
    registered.name = 'after';
    expect(snapshot.dump.executions.map((item) => item.name)).toEqual([
      'before',
    ]);
    expect(snapshot.dump.executions[0].tasks[0].errorMessage).toBe(
      'assertion failed',
    );
    expect(snapshot.dump.executions[0].tasks[0].recorder).toHaveLength(1);
    expect(snapshot.screenshots.map((item) => item.id)).toEqual([
      first.id,
      frame.id,
    ]);
    expect(snapshot.referenceImageUrls).toEqual([reference]);
    recorder.clear();
    expect(() => recorder.capture()).toThrow('metadata');
    expect(snapshot.dump.executions).toHaveLength(1);
  });

  it('stores the latest progress by ID and keeps anonymous observations separate', () => {
    const recorder = new ExecutionRecorder();
    recorder.record(createExecution([], 'first', 'stable'), defaultReportMeta);
    recorder.record(createExecution([], 'latest', 'stable'), defaultReportMeta);
    for (let i = 0; i < 2; i++)
      recorder.record(
        new ExecutionDump({ logTime: 100, name: 'anonymous', tasks: [] }),
        defaultReportMeta,
      );
    expect(
      recorder.toDump().executions.map((execution) => execution.name),
    ).toEqual(['latest', 'anonymous', 'anonymous']);
  });
});

describe('directory data persistence', () => {
  it('releases the lock when publication fails and retains the previous manifest', async () => {
    const root = getReportGeneratorTmpDir('artifact-failed-publication');
    roots.push(root);
    writeFileSync(join(root, 'report.json'), 'invalid manifest');
    const store = new ReportArtifactStore(root, 'failed', 'agent', true);
    await expect(store.writeExecution('step', '{}', {})).rejects.toThrow();
    expect(readFileSync(join(root, 'report.json'), 'utf8')).toBe(
      'invalid manifest',
    );
    expect(existsSync(join(root, '.report.json.lock'))).toBe(false);
    const fresh = new ReportArtifactStore(root, 'fresh');
    await fresh.writeExecution('step', '{}', {});
    await fresh.finalize();
    expect(
      JSON.parse(readFileSync(join(root, 'report.json'), 'utf8')).groups[0].id,
    ).toBe('fresh');
  });

  it('times out without stealing an active publisher lock or running a second transaction', async () => {
    const root = getReportGeneratorTmpDir('artifact-lock-timeout');
    roots.push(root);
    const secondPublication = rs.fn(async () => {});
    await withReportArtifactLock(root, async () => {
      await expect(
        withReportArtifactLock(root, secondPublication, 25),
      ).rejects.toThrow('Timed out waiting for report artifact lock');
      expect(existsSync(join(root, '.report.json.lock'))).toBe(true);
      expect(secondPublication).not.toHaveBeenCalled();
    });
    expect(existsSync(join(root, '.report.json.lock'))).toBe(false);
    await withReportArtifactLock(root, secondPublication);
    expect(secondPublication).toHaveBeenCalledOnce();
  });

  it('serializes concurrent progress, indexes one file per execution and needs no Viewer', async () => {
    const root = getReportGeneratorTmpDir('artifact');
    roots.push(root);
    const store = new ReportArtifactStore(root, 'stream');
    await Promise.all([
      store.writeExecution('step', '{"state":"running"}', {}),
      store.writeExecution('step', '{"state":"finished"}', {}),
      store.writeExecution('other', '{"state":"failed"}', {}),
    ]);
    await store.writeRunner('{"cases":[]}');
    await store.finalize();
    const manifest = JSON.parse(
      readFileSync(join(root, 'report.json'), 'utf8'),
    );
    expect(manifest.status).toBe('complete');
    expect(manifest.groups[0].dumps).toHaveLength(2);
    expect(
      JSON.parse(readFileSync(join(root, manifest.groups[0].dumps[0]), 'utf8')),
    ).toEqual({ state: 'finished' });
    expect(existsSync(join(root, 'index.html'))).toBe(false);
    expect(readdirSync(join(root, 'data', 'stream')).sort()).toEqual([
      '1.json',
      '2.json',
      'runner.json',
    ]);
  });

  it('preserves concurrent reused streams and rejects invalid report IDs', async () => {
    const root = getReportGeneratorTmpDir('artifact-reuse');
    roots.push(root);
    const stores = ['first', 'second'].map(
      (id) => new ReportArtifactStore(root, id, 'agent', true),
    );
    await Promise.all(
      stores.map((store) => store.writeExecution('step', '{}', {})),
    );
    const manifest = JSON.parse(
      readFileSync(join(root, 'report.json'), 'utf8'),
    );
    expect(
      manifest.groups.map((group: { id: string }) => group.id).sort(),
    ).toEqual(['first', 'second']);
    expect(() => new ReportArtifactStore(root, '../outside')).toThrow(
      'Invalid report artifact ID',
    );
  });

  it('retains the existing group and all eight process publishers, including later original-writer updates', async () => {
    const root = getReportGeneratorTmpDir('artifact-processes');
    roots.push(root);
    const original = new ReportArtifactStore(root, 'original');
    await original.writeExecution('step', '{"reportId":"original"}', {});
    const ids = Array.from({ length: 8 }, (_, index) => `worker-${index}`);
    const publishers = ids.map((id) => {
      const child = fork(
        join(__dirname, 'test-helpers/report-artifact-publisher.cjs'),
        [
          join(__dirname, '../../src/dump/report-artifact-store.ts'),
          root,
          id,
          require.resolve('typescript'),
        ],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
      );
      let stderr = '';
      child.stderr!.on('data', (chunk) => {
        stderr += chunk;
      });
      const ready = new Promise<void>((resolve, reject) => {
        child.once('message', () => resolve());
        child.once('error', reject);
        child.once('exit', () =>
          reject(new Error(`Publisher ${id} exited before ready: ${stderr}`)),
        );
      });
      const done = new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`Publisher ${id} failed: ${stderr}`)),
        );
      });
      // A startup failure is observed by both promises, including before ready.
      void done.catch(() => {});
      return { child, ready, done };
    });
    try {
      await Promise.all(publishers.map(({ ready }) => ready));
      for (const { child } of publishers) child.send('publish');
      await Promise.all(publishers.map(({ done }) => done));
      const readManifest = () =>
        JSON.parse(readFileSync(join(root, 'report.json'), 'utf8'));
      expect(
        readManifest()
          .groups.map((group: { id: string }) => group.id)
          .sort(),
      ).toEqual(['original', ...ids].sort());
      // The first writer also joins subsequent read/merge/write transactions.
      await original.writeExecution(
        'step',
        '{"reportId":"original","state":"complete"}',
        {},
      );
      await original.finalize();
      const manifest = readManifest();
      expect(manifest.groups).toHaveLength(9);
      for (const group of manifest.groups) {
        expect(group.dumps).toHaveLength(1);
        expect(
          JSON.parse(readFileSync(join(root, group.dumps[0]), 'utf8')),
        ).toEqual({ reportId: group.id, state: 'complete' });
      }
    } finally {
      for (const { child } of publishers)
        if (child.exitCode === null) child.kill();
      await Promise.allSettled(publishers.map(({ done }) => done));
    }
  }, 30_000);
});
