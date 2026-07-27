import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '@/agent';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { readUIObservationRecord } from '@midscene/shared/agent-tools/observation-record';
import { afterEach, describe, expect, it, vi } from 'vitest';

const defaultModel = { config: { slot: 'default' } };
const tempDirectories: string[] = [];

function createOutputPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'midscene-agent-observer-'));
  tempDirectories.push(directory);
  return join(directory, 'observation.json');
}

const dataUrl = (text: string) =>
  `data:image/png;base64,${Buffer.from(text).toString('base64')}`;

const fakeContext = (tag: string): UIContext =>
  ({
    screenshot: ScreenshotItem.create(dataUrl(tag), Date.now()),
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  }) as UIContext;

const createAgentStub = (opts: { openFrameSource?: () => any } = {}) => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  const createTypeQueryExecution = vi.fn(async () => ({
    output: true,
    thought: 'ok',
  }));
  const screenshotBase64 = vi.fn(async () => dataUrl('fallback'));
  (agent as any).opts = {};
  (agent as any).taskExecutor = { createTypeQueryExecution };
  (agent as any).resolveModelRuntime = vi.fn(() => defaultModel);
  (agent as any).interface = {
    screenshotBase64,
    ...(opts.openFrameSource ? { openFrameSource: opts.openFrameSource } : {}),
  };
  (agent as any).getUIContext = vi.fn(async () =>
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

  it('passes the exported file-backed record to aiAssert', async () => {
    const decode = vi.fn(async (refs: any[]) =>
      refs.map((frame) => dataUrl(`decoded:${frame.ref}`)),
    );
    const stop = vi.fn();
    let tick = 0;
    const openFrameSource = vi.fn(async () => ({
      latest: () => ({ ref: `frame-${tick++}`, capturedAt: tick }),
      decode,
      stop,
    }));
    const { agent, createTypeQueryExecution, screenshotBase64 } =
      createAgentStub({ openFrameSource });

    const observer = await agent.startObserving({
      intervalMs: 200,
      outputPath: createOutputPath(),
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await observer.stop();
    const observationRecord = await observer.exportRecord();
    await agent.aiAssert('a toast appeared during the process', undefined, {
      observationRecord,
    });

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
    expect(Buffer.from(sequence[0].rawBase64, 'base64').toString()).toMatch(
      /^decoded:/,
    );
  });

  it('rejects a second active observer but permits another after stop', async () => {
    const decode = vi.fn(async (refs: any[]) =>
      refs.map((frame) => dataUrl(`decoded:${frame.ref}`)),
    );
    const stop = vi.fn();
    const openFrameSource = vi.fn(async () => ({
      latest: () => ({ ref: 'f0', capturedAt: 0 }),
      decode,
      stop,
    }));
    const { agent } = createAgentStub({ openFrameSource });

    const observer1 = await agent.startObserving({
      intervalMs: 200,
      outputPath: createOutputPath(),
    });
    await expect(
      agent.startObserving({
        intervalMs: 200,
        outputPath: createOutputPath(),
      }),
    ).rejects.toThrow(/already active/);
    await observer1.stop();
    const observer2 = await agent.startObserving({
      intervalMs: 200,
      outputPath: createOutputPath(),
    });
    await observer2.stop();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('falls back to plain screenshots when no frame source exists', async () => {
    const { agent, screenshotBase64 } = createAgentStub();
    const observer = await agent.startObserving({
      intervalMs: 200,
      outputPath: createOutputPath(),
    });
    await observer.stop();
    const record = readUIObservationRecord(await observer.exportRecord());

    expect(screenshotBase64).toHaveBeenCalled();
    expect(record.frames.length).toBeGreaterThanOrEqual(2);
  });

  it('rebuilds ordered assertion context from resolved image paths', async () => {
    const { agent, createTypeQueryExecution } = createAgentStub();
    const directory = mkdtempSync(join(tmpdir(), 'midscene-record-frames-'));
    tempDirectories.push(directory);
    const framePaths = ['before', 'toast', 'after'].map((name) => {
      const path = join(directory, `${name}.png`);
      writeFileSync(path, Buffer.from(name));
      return path;
    });

    await agent.aiAssert('a toast appeared during the process', undefined, {
      observationRecord: {
        type: 'midscene_ui_observation',
        version: 1,
        frames: framePaths.map((path, index) => ({
          path,
          mimeType: 'image/png',
          capturedAt: (index + 1) * 100,
        })),
        shotSize: { width: 100, height: 100 },
        shrunkShotToLogicalRatio: 1,
      },
      keepRawResponse: true,
    });

    const executionOptions = (
      createTypeQueryExecution.mock.calls[0] as any[]
    )[5];
    expect(
      executionOptions.uiContext.screenshotSequence.map(
        (frame: ScreenshotItem) =>
          Buffer.from(frame.rawBase64, 'base64').toString(),
      ),
    ).toEqual(['before', 'toast', 'after']);
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
});
