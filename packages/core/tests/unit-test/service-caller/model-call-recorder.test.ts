import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setMidsceneRunDir } from '@midscene/shared/common';
import { MIDSCENE_RECORD_MODEL_CALL } from '@midscene/shared/env/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelCallRecorder } from '../../../src/ai-model/service-caller/model-call-recorder';

const runDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.unmock('node:fs/promises');
  vi.unmock('@midscene/shared/common');
  setMidsceneRunDir(undefined);
  await Promise.all(
    runDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

describe('model call recorder', () => {
  const createRunDir = async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), 'midscene-model-record-'));
    runDirs.push(runDir);
    setMidsceneRunDir(runDir);
    return runDir;
  };

  it('does not create a record directory when recording is disabled', async () => {
    const runDir = await createRunDir();
    const recorder = new ModelCallRecorder();

    await recorder.record({ type: 'request' });

    await expect(readdir(path.join(runDir, 'model-requests'))).rejects.toThrow(
      /ENOENT/,
    );
  });

  it('uses one JSONL file when its first events are concurrent', async () => {
    vi.stubEnv(MIDSCENE_RECORD_MODEL_CALL, 'true');
    const runDir = await createRunDir();
    const recorder = new ModelCallRecorder();

    await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        recorder.record({ type: 'request', index }),
      ),
    );

    const recordDir = path.join(runDir, 'model-requests');
    const files = await readdir(recordDir);
    expect(files).toEqual([
      expect.stringMatching(new RegExp(`-${process.pid}\\.jsonl$`)),
    ]);

    const content = await readFile(path.join(recordDir, files[0]), 'utf8');
    expect(
      content
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line).index),
    ).toEqual([0, 1, 2, 3]);
  });

  it.each([
    ['browser', () => vi.stubGlobal('window', {})],
    ['worker', () => vi.stubGlobal('WorkerGlobalScope', class {})],
  ])('does not record in a %s runtime', async (_runtime, setupRuntime) => {
    vi.stubEnv(MIDSCENE_RECORD_MODEL_CALL, 'true');
    const runDir = await createRunDir();
    setupRuntime();
    vi.resetModules();
    const { ModelCallRecorder: RuntimeRecorder } = await import(
      '../../../src/ai-model/service-caller/model-call-recorder'
    );
    const recorder = new RuntimeRecorder();

    await recorder.record({ type: 'request' });

    await expect(readdir(path.join(runDir, 'model-requests'))).rejects.toThrow(
      /ENOENT/,
    );
  });

  it('continues recording after a write failure', async () => {
    vi.stubEnv(MIDSCENE_RECORD_MODEL_CALL, 'true');
    const appendFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk is full'))
      .mockResolvedValueOnce(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    vi.doMock('node:fs/promises', () => ({ appendFile, mkdir }));
    vi.doMock('@midscene/shared/common', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@midscene/shared/common')>()),
      getMidsceneRunBaseDir: () => '/tmp/midscene-model-record-test',
    }));
    const { ModelCallRecorder: RuntimeRecorder } = await import(
      '../../../src/ai-model/service-caller/model-call-recorder'
    );
    const recorder = new RuntimeRecorder();

    await expect(recorder.record({ type: 'request', index: 1 })).resolves.toBe(
      undefined,
    );
    await expect(recorder.record({ type: 'request', index: 2 })).resolves.toBe(
      undefined,
    );

    expect(appendFile).toHaveBeenCalledTimes(2);
  });
});
