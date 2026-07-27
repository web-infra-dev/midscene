import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type CliObservationSessionState,
  completeCliObservationWorker,
  markCliObservationWorkerRecording,
  readCliObservationSession,
  stopCliObservationWorker,
  waitForCliObservationStop,
  writeCliObservationSession,
} from '@/agent-tools/cli-observation-session';
import { setMidsceneRunDir } from '@/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('CLI observation session protocol', () => {
  let runDirectory: string;

  beforeEach(() => {
    runDirectory = mkdtempSync(join(tmpdir(), 'midscene-observation-session-'));
    setMidsceneRunDir(runDirectory);
  });

  afterEach(() => {
    setMidsceneRunDir(undefined);
    rmSync(runDirectory, { recursive: true });
  });

  function startingState(): CliObservationSessionState {
    return {
      version: 1,
      scope: 'midscene-web',
      sessionName: 'toast',
      token: 'token-1',
      phase: 'starting',
      pid: process.pid,
      stopFilePath: join(runDirectory, 'toast.stop'),
      logFilePath: join(runDirectory, 'toast.log'),
      updatedAt: Date.now(),
    };
  }

  it('persists worker readiness without losing the session identity', () => {
    const state = startingState();
    writeCliObservationSession(state);

    const recording = markCliObservationWorkerRecording(state);

    expect(recording).toMatchObject({
      scope: 'midscene-web',
      sessionName: 'toast',
      token: 'token-1',
      phase: 'recording',
    });
    expect(readCliObservationSession('midscene-web', 'toast')).toEqual(
      recording,
    );
  });

  it('signals the worker and waits for its completed output', async () => {
    const state = markCliObservationWorkerRecording(startingState());
    const outputPath = join(runDirectory, 'toast-observation.json');

    const worker = (async () => {
      while (!existsSync(state.stopFilePath)) await sleep(5);
      const stopping = readCliObservationSession('midscene-web', 'toast');
      expect(stopping?.phase).toBe('stopping');
      expect(stopping?.requestedOutputPath).toBe(outputPath);
      completeCliObservationWorker(stopping!, outputPath);
    })();
    const completed = await stopCliObservationWorker({
      scope: 'midscene-web',
      sessionName: 'toast',
      outputPath,
    });
    await worker;

    expect(completed.phase).toBe('complete');
    expect(completed.outputPath).toBe(outputPath);
  });

  it('ends a worker wait when its safety watchdog expires', async () => {
    const state = markCliObservationWorkerRecording(startingState());

    await expect(waitForCliObservationStop(state, 5)).resolves.toBe('watchdog');
  });
});
