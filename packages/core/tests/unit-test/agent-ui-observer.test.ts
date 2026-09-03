import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Agent } from '@/agent';
import {
  UIObservationImpl,
  uiContextFromObservationRecord,
} from '@/agent/ui-observer';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { resolveObservationArtifactAdapter } from '@midscene/shared/agent-tools/observation-artifact';
import type { UIObservationRecord } from '@midscene/shared/agent-tools/types';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

const defaultModel = { config: { slot: 'default' } };
const tempDirectories: string[] = [];

function trackRecordFiles(record: UIObservationRecord): void {
  for (const frame of record.frames) {
    tempDirectories.push(dirname(frame.path));
  }
}

const dataUrl = (_tag: string) =>
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mP4HKzauIeNgXXZh/+7OAApSwYLCdgqFgAAAABJRU5ErkJggg==';

const fakeContext = (tag: string): UIContext =>
  ({
    screenshot: ScreenshotItem.create(dataUrl(tag), Date.now()),
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  }) as UIContext;

const createAgentStub = (opts: { openFrameSource?: () => any } = {}) => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  const createTypeQueryExecution = rs.fn(async () => ({
    output: true,
    thought: 'ok',
  }));
  const screenshotBase64 = rs.fn(async () => dataUrl('fallback'));
  (agent as any).opts = {};
  (agent as any).ownedObservers = new Set();
  (agent as any).taskExecutor = { createTypeQueryExecution };
  (agent as any).resolveModelRuntime = rs.fn(() => defaultModel);
  (agent as any).interface = {
    screenshotBase64,
    ...(opts.openFrameSource ? { openFrameSource: opts.openFrameSource } : {}),
  };
  (agent as any).getUIContext = rs.fn(async () =>
    fakeContext('representative'),
  );
  return { agent, createTypeQueryExecution, screenshotBase64 };
};

describe('Agent.startObserving', () => {
  afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('returns a fixed observation that can run aiAssert', async () => {
    const decode = rs.fn(async (refs: any[]) =>
      refs.map((frame) => dataUrl(`decoded:${frame.ref}`)),
    );
    const stop = rs.fn();
    let tick = 0;
    const openFrameSource = rs.fn(async () => ({
      latest: () => ({ ref: `frame-${tick++}`, capturedAt: tick }),
      decode,
      stop,
    }));
    const { agent, createTypeQueryExecution, screenshotBase64 } =
      createAgentStub({ openFrameSource });

    const observer = await agent.startObserving({ intervalMs: 200 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const observation = await observer.stop();
    const observationRecord = await (
      observation as UIObservationImpl
    ).exportRecord();
    trackRecordFiles(observationRecord);
    await observation.aiAssert('a toast appeared during the process');

    expect(openFrameSource).toHaveBeenCalledOnce();
    expect(screenshotBase64).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
    const executionOptions = (
      createTypeQueryExecution.mock.calls[0] as any[]
    )[5];
    const sequence = executionOptions.uiContext.screenshotSequence;
    expect(sequence.length).toBeGreaterThanOrEqual(2);
    expect(sequence[0].hasBase64()).toBe(false);
    expect(sequence[0].toSerializable()).not.toHaveProperty('path');
    expect(sequence[0].format).toBe('webp');
    const frameBuffer = Buffer.from(sequence[0].rawBase64, 'base64');
    expect(frameBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(frameBuffer.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('rejects a second active observer but permits another after stop', async () => {
    const decode = rs.fn(async (refs: any[]) =>
      refs.map((frame) => dataUrl(`decoded:${frame.ref}`)),
    );
    const stop = rs.fn();
    const openFrameSource = rs.fn(async () => ({
      latest: () => ({ ref: 'f0', capturedAt: 0 }),
      decode,
      stop,
    }));
    const { agent } = createAgentStub({ openFrameSource });

    const observer1 = await agent.startObserving({ intervalMs: 200 });
    await expect(agent.startObserving({ intervalMs: 200 })).rejects.toThrow(
      /already active/,
    );
    const observation1 = await observer1.stop();
    trackRecordFiles(await (observation1 as UIObservationImpl).exportRecord());
    const observer2 = await agent.startObserving({ intervalMs: 200 });
    const observation2 = await observer2.stop();
    trackRecordFiles(await (observation2 as UIObservationImpl).exportRecord());
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('falls back to plain screenshots when no frame source exists', async () => {
    const { agent, screenshotBase64 } = createAgentStub();
    const observer = await agent.startObserving({ intervalMs: 200 });
    const observation = await observer.stop();
    const record = await (observation as UIObservationImpl).exportRecord();
    trackRecordFiles(record);

    expect(screenshotBase64).toHaveBeenCalled();
    expect(record.frames.length).toBeGreaterThanOrEqual(2);
  });

  it('disposes a stopped unexported observer when the agent is destroyed', async () => {
    const { agent } = createAgentStub();
    const observer = await agent.startObserving({ intervalMs: 200 });
    const observation = await observer.stop();
    const bufferedFrame = (observer as any).frames[0];
    const framePath = (observer as any).writer.resolveFramePath(
      bufferedFrame.persisted,
    );
    (agent as any).reportGenerator = {
      flush: rs.fn().mockResolvedValue(undefined),
      finalize: rs.fn().mockResolvedValue(undefined),
    };
    (agent as any).resetDump = rs.fn();

    expect(existsSync(framePath)).toBe(true);
    await agent.destroy();
    expect(existsSync(framePath)).toBe(false);
    await expect(observation.aiBoolean('anything')).rejects.toThrow(/disposed/);
  });

  it('rebuilds ordered assertion context from resolved image paths', async () => {
    const { agent, createTypeQueryExecution } = createAgentStub();
    const directory = mkdtempSync(join(tmpdir(), 'midscene-record-frames-'));
    tempDirectories.push(directory);
    const framePaths = ['before', 'toast', 'after'].map((name) => {
      const path = join(directory, `${name}.png`);
      writeFileSync(
        path,
        Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          Buffer.from(name),
        ]),
      );
      return path;
    });

    const record: UIObservationRecord = {
      type: 'midscene_ui_observation',
      version: 1,
      startedAt: 100,
      endedAt: 300,
      frames: framePaths.map((path, index) => ({
        path,
        mimeType: 'image/png',
        capturedAt: (index + 1) * 100,
      })),
      shotSize: { width: 100, height: 100 },
      shrunkShotToLogicalRatio: 1,
    };
    const observation = new UIObservationImpl(
      record,
      (agent as any).createInsight(() =>
        uiContextFromObservationRecord(record),
      ),
    );
    await observation.aiAssert(
      'a toast appeared during the process',
      undefined,
      {
        keepRawResponse: true,
      },
    );

    const executionOptions = (
      createTypeQueryExecution.mock.calls[0] as any[]
    )[5];
    expect(
      executionOptions.uiContext.screenshotSequence.map(
        (frame: ScreenshotItem) =>
          Buffer.from(frame.rawBase64, 'base64').subarray(8).toString(),
      ),
    ).toEqual(['before', 'toast', 'after']);

    await observation.aiQuery<string>('summarize the transition');
    await observation.aiBoolean('did a toast appear?');
    await observation.aiNumber('how many states are visible?');
    await observation.aiString('what changed?');
    await observation.aiAsk('describe the transition');

    expect(observation.frameCount).toBe(3);
    expect(observation.startedAt).toBe(100);
    expect(observation.endedAt).toBe(300);
    expect(
      createTypeQueryExecution.mock.calls.map((call) => (call as any[])[0]),
    ).toEqual(['Assert', 'Query', 'Boolean', 'Number', 'String', 'String']);
    for (const call of createTypeQueryExecution.mock.calls) {
      expect((call as any[])[5].uiContext.screenshotSequence).toHaveLength(3);
    }
  });

  it('plain aiAssert and aiBoolean remain single-frame', async () => {
    const { agent, createTypeQueryExecution } = createAgentStub();
    await agent.aiAssert('the page is fine', undefined, {
      keepRawResponse: true,
    });
    await agent.aiBoolean('is the page fine?');

    expect(
      (createTypeQueryExecution.mock.calls[0] as any[])[5].uiContext,
    ).toBeUndefined();
    expect(
      (createTypeQueryExecution.mock.calls[1] as any[])[5]?.uiContext,
    ).toBeUndefined();
  });

  it('exposes CLI artifact persistence without expanding the Agent API', async () => {
    const agent = new Agent(
      {
        interfaceType: 'puppeteer',
        actionSpace: () => [],
        screenshotBase64: async () => dataUrl('screen'),
        size: async () => ({ width: 100, height: 100 }),
      } as any,
      { generateReport: false },
    );
    const directory = mkdtempSync(join(tmpdir(), 'midscene-adapter-record-'));
    tempDirectories.push(directory);
    const framePath = join(directory, 'frame.png');
    writeFileSync(
      framePath,
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('frame'),
      ]),
    );
    const record: UIObservationRecord = {
      type: 'midscene_ui_observation',
      version: 1,
      startedAt: 100,
      endedAt: 200,
      frames: [
        {
          path: framePath,
          mimeType: 'image/png',
          capturedAt: 150,
        },
      ],
      shotSize: { width: 100, height: 100 },
      shrunkShotToLogicalRatio: 1,
    };

    expect((agent as any).loadUIObservation).toBeUndefined();
    const adapter = resolveObservationArtifactAdapter(agent);
    expect(adapter).toBeDefined();
    const observation = adapter!.loadRecord(record);
    const exported = await adapter!.exportRecord(observation);
    exported.frames.length = 0;

    expect(observation.frameCount).toBe(1);
    await expect(adapter!.exportRecord(observation)).resolves.toMatchObject({
      frames: [expect.objectContaining({ path: framePath })],
    });
    await agent.destroy();
  });
});
