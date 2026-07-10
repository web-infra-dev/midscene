import { Agent } from '@/agent';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import { describe, expect, it, vi } from 'vitest';

const defaultModel = { config: { slot: 'default' } };

const fakeContext = (tag: string): UIContext =>
  ({
    screenshot: ScreenshotItem.create(
      `data:image/png;base64,iVBORw0KGgo-${tag}`,
      Date.now(),
    ),
    shotSize: { width: 100, height: 100 },
    shrunkShotToLogicalRatio: 1,
  }) as UIContext;

const createAgentStub = (opts: { openFrameSource?: () => any } = {}) => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  const createTypeQueryExecution = vi.fn(async () => ({
    output: true,
    thought: 'ok',
  }));
  const screenshotBase64 = vi.fn(
    async () => 'data:image/png;base64,iVBORw0KGgo-fallback',
  );
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
  it('prefers the device frame source and passes an observed multi-frame context to aiAssert', async () => {
    const decode = vi.fn(async (refs: any[]) =>
      refs.map((r) => `dec:${r.ref}`),
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

    const observer = await agent.startObserving({ intervalMs: 200 });
    await new Promise((r) => setTimeout(r, 250));
    await observer.stop();
    await observer.aiAssert('a toast appeared during the process');

    expect(openFrameSource).toHaveBeenCalledTimes(1);
    expect(screenshotBase64).not.toHaveBeenCalled(); // no fallback used
    expect(stop).toHaveBeenCalledTimes(1);

    // the Assert task received the observed multi-frame uiContext
    const executionOptions = (
      createTypeQueryExecution.mock.calls[0] as any[]
    )[5];
    expect(executionOptions.uiContext).toBeDefined();
    const sequence = executionOptions.uiContext.screenshotSequence;
    expect(sequence.length).toBeGreaterThanOrEqual(2);
    expect(sequence[0].base64.startsWith('dec:')).toBe(true);
  });

  it('rejects starting a second observer while one is active', async () => {
    const decode = vi.fn(async (refs: any[]) =>
      refs.map((r) => `dec:${r.ref}`),
    );
    const stop = vi.fn();
    const openFrameSource = vi.fn(async () => ({
      latest: () => ({ ref: 'f0', capturedAt: 0 }),
      decode,
      stop,
    }));
    const { agent } = createAgentStub({ openFrameSource });

    const observer1 = await agent.startObserving({ intervalMs: 200 });
    await expect(agent.startObserving({ intervalMs: 200 })).rejects.toThrow(
      /already active/,
    );

    // After stopping, a new observer can start.
    await observer1.stop();
    const observer2 = await agent.startObserving({ intervalMs: 200 });
    await observer2.stop();
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('falls back to plain screenshots when the device has no frame source', async () => {
    const { agent, createTypeQueryExecution, screenshotBase64 } =
      createAgentStub();

    const observer = await agent.startObserving({ intervalMs: 200 });
    await observer.stop();
    const result = await observer.aiBoolean('did a toast appear?');

    expect(result).toBe(true);
    expect(screenshotBase64).toHaveBeenCalled();
    const executionOptions = (
      createTypeQueryExecution.mock.calls[0] as any[]
    )[5];
    expect(
      executionOptions.uiContext.screenshotSequence.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('plain aiAssert / aiBoolean stay single-frame (no uiContext injected)', async () => {
    const { agent, createTypeQueryExecution } = createAgentStub();

    await agent.aiAssert('the page is fine', undefined, {
      keepRawResponse: true,
    });
    await agent.aiBoolean('is the page fine?');

    const assertOptions = (createTypeQueryExecution.mock.calls[0] as any[])[5];
    expect(assertOptions.uiContext).toBeUndefined();
    const booleanOptions = (createTypeQueryExecution.mock.calls[1] as any[])[5];
    expect(booleanOptions?.uiContext).toBeUndefined();
  });
});
