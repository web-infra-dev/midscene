import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ExecutionRecorder } from '@/dump/execution-recorder';
import { ReportArtifactStore } from '@/dump/report-artifact-store';
import { ScreenshotItem } from '@/screenshot-item';
import { ExecutionDump } from '@/types';
import { afterEach, describe, expect, it } from '@rstest/core';
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
});
